'use client';

import type { FormEvent } from 'react';
import type { DecisionKeywordPolicy } from '../lib/types';
import { Button, Card, CardContent, CardHeader, CardTitle, Checkbox, Input, Label, Textarea } from './ui';

type Props = {
  policies: DecisionKeywordPolicy[];
  keywordPolicyName: string;
  setKeywordPolicyName: (value: string) => void;
  keywordPositiveText: string;
  setKeywordPositiveText: (value: string) => void;
  keywordNegativeText: string;
  setKeywordNegativeText: (value: string) => void;
  keywordPathPositiveText: string;
  setKeywordPathPositiveText: (value: string) => void;
  keywordPathNegativeText: string;
  setKeywordPathNegativeText: (value: string) => void;
  keywordWeightPositive: number;
  setKeywordWeightPositive: (value: number) => void;
  keywordWeightNegative: number;
  setKeywordWeightNegative: (value: number) => void;
  keywordPolicyEnabled: boolean;
  setKeywordPolicyEnabled: (value: boolean) => void;
  keywordPolicyReason: string;
  setKeywordPolicyReason: (value: string) => void;
  createDecisionKeywordPolicy: (event: FormEvent) => Promise<void>;
  patchDecisionKeywordPolicy: (
    policyId: string,
    patch: Partial<{
      name: string;
      positive_keywords: string[];
      negative_keywords: string[];
      file_path_positive_patterns: string[];
      file_path_negative_patterns: string[];
      weight_positive: number;
      weight_negative: number;
      enabled: boolean;
    }>
  ) => Promise<void>;
  deleteDecisionKeywordPolicy: (policyId: string) => Promise<void>;
};

export function DecisionKeywordPoliciesPanel(props: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Decision Keyword Policies</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="muted">
          Keywords do NOT decide decisions. They only prioritize LLM processing.
        </div>

        <form className="stack gap-2" onSubmit={(event) => void props.createDecisionKeywordPolicy(event)}>
          <div className="row">
            <div className="stack gap-1">
              <Label className="muted">Policy Name</Label>
              <Input
                value={props.keywordPolicyName}
                onChange={(event) => props.setKeywordPolicyName(event.target.value)}
              />
            </div>
            <div className="stack gap-1">
              <Label className="muted">Weight Positive</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={props.keywordWeightPositive}
                onChange={(event) =>
                  props.setKeywordWeightPositive(Math.max(Number(event.target.value) || 0, 0))
                }
              />
            </div>
            <div className="stack gap-1">
              <Label className="muted">Weight Negative</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={props.keywordWeightNegative}
                onChange={(event) =>
                  props.setKeywordWeightNegative(Math.max(Number(event.target.value) || 0, 0))
                }
              />
            </div>
          </div>

          <div className="row">
            <div className="stack gap-1">
              <Label className="muted">Positive Keywords</Label>
              <Textarea
                rows={4}
                value={props.keywordPositiveText}
                onChange={(event) => props.setKeywordPositiveText(event.target.value)}
                placeholder={'migrate\nrename\ndeprecate'}
              />
            </div>
            <div className="stack gap-1">
              <Label className="muted">Negative Keywords</Label>
              <Textarea
                rows={4}
                value={props.keywordNegativeText}
                onChange={(event) => props.setKeywordNegativeText(event.target.value)}
                placeholder={'wip\ntmp\ndebug'}
              />
            </div>
          </div>

          <div className="row">
            <div className="stack gap-1">
              <Label className="muted">Positive File Path Patterns</Label>
              <Textarea
                rows={3}
                value={props.keywordPathPositiveText}
                onChange={(event) => props.setKeywordPathPositiveText(event.target.value)}
                placeholder={'apps/memory-core/**\npackages/shared/**'}
              />
            </div>
            <div className="stack gap-1">
              <Label className="muted">Negative File Path Patterns</Label>
              <Textarea
                rows={3}
                value={props.keywordPathNegativeText}
                onChange={(event) => props.setKeywordPathNegativeText(event.target.value)}
                placeholder={'**/*.test.*\n**/tmp/**'}
              />
            </div>
          </div>

          <div className="row">
            <div className="flex items-center gap-2">
              <Checkbox
                id="keyword-policy-enabled"
                checked={props.keywordPolicyEnabled}
                onCheckedChange={(value) => props.setKeywordPolicyEnabled(value === true)}
              />
              <Label htmlFor="keyword-policy-enabled" className="text-sm text-muted-foreground">
                policy enabled
              </Label>
            </div>
            <div className="stack gap-1">
              <Label className="muted">Reason (for audit log)</Label>
              <Input
                value={props.keywordPolicyReason}
                onChange={(event) => props.setKeywordPolicyReason(event.target.value)}
                placeholder="why this policy changed"
              />
            </div>
          </div>

          <div className="toolbar">
            <Button type="submit">Create Policy</Button>
          </div>
        </form>

        <div className="stack gap-2">
          {props.policies.map((policy) => (
            <div key={policy.id} className="result-item">
              <div>
                <strong>{policy.name}</strong> ({policy.enabled ? 'enabled' : 'disabled'})
              </div>
              <div className="muted">
                +{policy.positive_keywords.length} keywords / -{policy.negative_keywords.length} keywords /
                +{policy.file_path_positive_patterns.length} paths / -{policy.file_path_negative_patterns.length}{' '}
                paths
              </div>
              <div className="muted">
                weight_positive={policy.weight_positive}, weight_negative={policy.weight_negative}
              </div>
              <div className="toolbar">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    void props.patchDecisionKeywordPolicy(policy.id, {
                      enabled: !policy.enabled,
                    })
                  }
                >
                  {policy.enabled ? 'Disable' : 'Enable'}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void props.deleteDecisionKeywordPolicy(policy.id)}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
