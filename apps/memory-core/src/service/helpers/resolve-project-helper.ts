import { ResolutionKind, type PrismaClient } from '@prisma/client';
import { resolveProjectSchema } from '@claustrum/shared';
import type { AuthContext } from '../../auth.js';
import { assertProjectAccess, assertWorkspaceAccess } from '../access-control.js';
import { NotFoundError, ValidationError } from '../errors.js';
import {
  buildGithubExternalIdCandidates,
  composeMonorepoProjectKey,
  getEffectiveWorkspaceSettings,
  normalizeGithubSelector,
  normalizeSubpathForSplitPolicy,
  resolveMonorepoSubpath,
  toGithubMappingExternalId,
} from '../workspace-resolution.js';

type ResolveProjectResult = {
  workspace_key: string;
  project: { key: string; id: string; name: string };
  resolution: ResolutionKind;
  matched_mapping_id?: string;
  created?: boolean;
};

export async function resolveProjectByPriority(args: {
  prisma: PrismaClient;
  auth: AuthContext;
  input: unknown;
  getWorkspaceByKey: (workspaceKey: string) => Promise<{ id: string; key: string }>;
  createProjectAndMapping: (args: {
    workspaceId: string;
    kind: ResolutionKind;
    externalId: string;
    projectKey: string;
    projectName: string;
  }) => Promise<{
    project: { id: string; key: string; name: string };
    mapping: { id: string };
    created: boolean;
  }>;
  ensureProjectMapping: (args: {
    workspaceId: string;
    projectId: string;
    kind: ResolutionKind;
    externalId: string;
  }) => Promise<{ id: string }>;
}): Promise<ResolveProjectResult> {
  const parsed = resolveProjectSchema.safeParse(args.input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join(', '));
  }

  const input = parsed.data;
  const workspace = await args.getWorkspaceByKey(input.workspace_key);
  await assertWorkspaceAccess(args.prisma, args.auth, workspace.id);
  const settings = await getEffectiveWorkspaceSettings(args.prisma, workspace.id);

  for (const kind of settings.resolutionOrder) {
    if (kind === ResolutionKind.github_remote) {
      const github = normalizeGithubSelector(input);
      if (!github) {
        continue;
      }
      const monorepoContextMode = settings.monorepoContextMode;
      const splitOnDemandMode = monorepoContextMode === 'split_on_demand';
      const splitAutoMode = monorepoContextMode === 'split_auto';
      const monorepoEnabled = settings.enableMonorepoResolution && input.monorepo?.enabled !== false;
      const detectedMonorepoSubpath = monorepoEnabled
        ? resolveMonorepoSubpath(input, {
            monorepoMode: settings.monorepoMode,
            monorepoWorkspaceGlobs: settings.monorepoWorkspaceGlobs,
            monorepoExcludeGlobs: settings.monorepoExcludeGlobs,
            monorepoMaxDepth: settings.monorepoMaxDepth,
          })
        : null;
      const monorepoSubpath = normalizeSubpathForSplitPolicy(
        detectedMonorepoSubpath,
        settings.monorepoMaxDepth,
        settings.monorepoExcludeGlobs
      );
      const repoExternalCandidates = buildGithubExternalIdCandidates(github, null);
      const subprojectExternalCandidates = monorepoSubpath
        ? buildGithubExternalIdCandidates(github, monorepoSubpath, { includeBase: false })
        : [];

      const mapping = await args.prisma.projectMapping.findFirst({
        where: {
          workspaceId: workspace.id,
          kind: ResolutionKind.github_remote,
          externalId: { in: repoExternalCandidates },
          isEnabled: true,
        },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
        include: { project: true },
      });
      if (mapping) {
        const shouldUseSplitOnDemand =
          splitOnDemandMode &&
          monorepoSubpath &&
          (await hasEnabledSubprojectPolicy(args.prisma, {
            workspaceId: workspace.id,
            repoKey: mapping.project.key,
            subpath: monorepoSubpath,
          }));
        const shouldUseSplitAuto = splitAutoMode && monorepoSubpath;
        const shouldTrySubproject = shouldUseSplitOnDemand || shouldUseSplitAuto;

        if (shouldTrySubproject && monorepoSubpath) {
          const subprojectMapping = await args.prisma.projectMapping.findFirst({
            where: {
              workspaceId: workspace.id,
              kind: ResolutionKind.github_remote,
              externalId: { in: subprojectExternalCandidates },
              isEnabled: true,
            },
            orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
            include: { project: true },
          });
          if (subprojectMapping) {
            await assertProjectAccess(
              args.prisma,
              args.auth,
              subprojectMapping.project.workspaceId,
              subprojectMapping.project.id
            );
            return {
              workspace_key: workspace.key,
              project: {
                key: subprojectMapping.project.key,
                id: subprojectMapping.project.id,
                name: subprojectMapping.project.name,
              },
              resolution: ResolutionKind.github_remote,
              matched_mapping_id: subprojectMapping.id,
            };
          }

          if (shouldUseSplitOnDemand || (shouldUseSplitAuto && settings.githubAutoCreateSubprojects)) {
            const projectKey = composeMonorepoProjectKey(
              mapping.project.key,
              monorepoSubpath,
              settings.monorepoMode
            );
            const createdSubproject = await args.createProjectAndMapping({
              workspaceId: workspace.id,
              kind: ResolutionKind.github_remote,
              externalId: toGithubMappingExternalId(github.normalized, monorepoSubpath),
              projectKey,
              projectName: `${mapping.project.name} / ${monorepoSubpath}`,
            });
            await assertProjectAccess(
              args.prisma,
              args.auth,
              workspace.id,
              createdSubproject.project.id
            );
            return {
              workspace_key: workspace.key,
              project: {
                key: createdSubproject.project.key,
                id: createdSubproject.project.id,
                name: createdSubproject.project.name,
              },
              resolution: ResolutionKind.github_remote,
              matched_mapping_id: createdSubproject.mapping.id,
              created: createdSubproject.created,
            };
          }
        }

        await assertProjectAccess(args.prisma, args.auth, mapping.project.workspaceId, mapping.project.id);
        return {
          workspace_key: workspace.key,
          project: {
            key: mapping.project.key,
            id: mapping.project.id,
            name: mapping.project.name,
          },
          resolution: ResolutionKind.github_remote,
          matched_mapping_id: mapping.id,
        };
      }

      if (settings.githubAutoCreateProjects) {
        const repoProject = await args.createProjectAndMapping({
          workspaceId: workspace.id,
          kind: ResolutionKind.github_remote,
          externalId: toGithubMappingExternalId(github.normalized),
          projectKey: `${settings.githubProjectKeyPrefix}${github.normalized}`,
          projectName: github.normalized,
        });
        if (
          splitOnDemandMode &&
          monorepoSubpath &&
          (await hasEnabledSubprojectPolicy(args.prisma, {
            workspaceId: workspace.id,
            repoKey: repoProject.project.key,
            subpath: monorepoSubpath,
          }))
        ) {
          const subprojectKey = composeMonorepoProjectKey(
            repoProject.project.key,
            monorepoSubpath,
            settings.monorepoMode
          );
          const subproject = await args.createProjectAndMapping({
            workspaceId: workspace.id,
            kind: ResolutionKind.github_remote,
            externalId: toGithubMappingExternalId(github.normalized, monorepoSubpath),
            projectKey: subprojectKey,
            projectName: `${github.normalized} / ${monorepoSubpath}`,
          });
          await assertProjectAccess(args.prisma, args.auth, workspace.id, subproject.project.id);
          return {
            workspace_key: workspace.key,
            project: {
              key: subproject.project.key,
              id: subproject.project.id,
              name: subproject.project.name,
            },
            resolution: ResolutionKind.github_remote,
            matched_mapping_id: subproject.mapping.id,
            created: subproject.created || repoProject.created,
          };
        }
        if (
          splitAutoMode &&
          monorepoSubpath &&
          settings.githubAutoCreateSubprojects
        ) {
          const subprojectKey = composeMonorepoProjectKey(
            repoProject.project.key,
            monorepoSubpath,
            settings.monorepoMode
          );
          const subproject = await args.createProjectAndMapping({
            workspaceId: workspace.id,
            kind: ResolutionKind.github_remote,
            externalId: toGithubMappingExternalId(github.normalized, monorepoSubpath),
            projectKey: subprojectKey,
            projectName: `${github.normalized} / ${monorepoSubpath}`,
          });
          await assertProjectAccess(args.prisma, args.auth, workspace.id, subproject.project.id);
          return {
            workspace_key: workspace.key,
            project: {
              key: subproject.project.key,
              id: subproject.project.id,
              name: subproject.project.name,
            },
            resolution: ResolutionKind.github_remote,
            matched_mapping_id: subproject.mapping.id,
            created: subproject.created || repoProject.created,
          };
        }
        await assertProjectAccess(args.prisma, args.auth, workspace.id, repoProject.project.id);
        return {
          workspace_key: workspace.key,
          project: {
            key: repoProject.project.key,
            id: repoProject.project.id,
            name: repoProject.project.name,
          },
          resolution: ResolutionKind.github_remote,
          matched_mapping_id: repoProject.mapping.id,
          created: repoProject.created,
        };
      }
    }

    if (kind === ResolutionKind.repo_root_slug) {
      const slug = (input.repo_root_slug || '').trim();
      if (!slug) {
        continue;
      }

      const mapping = await args.prisma.projectMapping.findFirst({
        where: {
          workspaceId: workspace.id,
          kind: ResolutionKind.repo_root_slug,
          externalId: slug,
          isEnabled: true,
        },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
        include: { project: true },
      });
      if (mapping) {
        await assertProjectAccess(args.prisma, args.auth, mapping.project.workspaceId, mapping.project.id);
        return {
          workspace_key: workspace.key,
          project: {
            key: mapping.project.key,
            id: mapping.project.id,
            name: mapping.project.name,
          },
          resolution: ResolutionKind.repo_root_slug,
          matched_mapping_id: mapping.id,
        };
      }

      if (settings.autoCreateProject) {
        const created = await args.createProjectAndMapping({
          workspaceId: workspace.id,
          kind: ResolutionKind.repo_root_slug,
          externalId: slug,
          projectKey: `${settings.localKeyPrefix}${slug}`,
          projectName: slug,
        });
        await assertProjectAccess(args.prisma, args.auth, workspace.id, created.project.id);
        return {
          workspace_key: workspace.key,
          project: {
            key: created.project.key,
            id: created.project.id,
            name: created.project.name,
          },
          resolution: ResolutionKind.repo_root_slug,
          matched_mapping_id: created.mapping.id,
          created: created.created,
        };
      }
    }

    if (kind === ResolutionKind.manual) {
      const manualKey = (input.manual_project_key || '').trim();
      if (!manualKey) {
        continue;
      }
      const project = await args.prisma.project.findUnique({
        where: {
          workspaceId_key: {
            workspaceId: workspace.id,
            key: manualKey,
          },
        },
      });
      if (!project) {
        throw new NotFoundError(`Project not found for manual selection: ${manualKey}`);
      }
      await assertProjectAccess(args.prisma, args.auth, workspace.id, project.id);
      const mapping = await args.ensureProjectMapping({
        workspaceId: workspace.id,
        projectId: project.id,
        kind: ResolutionKind.manual,
        externalId: manualKey,
      });
      return {
        workspace_key: workspace.key,
        project: {
          key: project.key,
          id: project.id,
          name: project.name,
        },
        resolution: ResolutionKind.manual,
        matched_mapping_id: mapping.id,
      };
    }
  }

  throw new NotFoundError('Could not resolve project from provided selectors.');
}

async function hasEnabledSubprojectPolicy(
  prisma: PrismaClient,
  args: { workspaceId: string; repoKey: string; subpath: string }
): Promise<boolean> {
  const row = await prisma.monorepoSubprojectPolicy.findFirst({
    where: {
      workspaceId: args.workspaceId,
      repoKey: args.repoKey,
      subpath: args.subpath,
      enabled: true,
    },
    select: { id: true },
  });
  return Boolean(row);
}
