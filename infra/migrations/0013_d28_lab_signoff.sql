-- Owner signoff for D28 hardware/legal gates.
--
-- This does not enable public hardware deployment. It records that controlled
-- D12 lab pilots may proceed when runtime gates also see lab-mode envs, approved
-- reference rig IDs, local execution, and physical confirmation.

INSERT INTO platform_gate_signoffs (
  gate_key,
  status,
  policy_version,
  jurisdiction,
  reviewer,
  evidence,
  evidence_url,
  effective_at
)
SELECT
  'd28.hardware',
  'accepted',
  'd30-d28-lab-signoff-2026-06-14',
  'US/EU',
  'owner',
  jsonb_build_object(
    'decision', 'D30',
    'scope', 'D12 controlled lab pilots only',
    'approvedRigIds', jsonb_build_array(
      'ref_quad_kakute-h7-source-one-5in',
      'ref_rover_waveshare-ugv-rover-pt-pi5-ros2'
    ),
    'requiresLabMode', true,
    'requiresPhysicalConfirmation', true,
    'noAutoArm', true,
    'policyAuthority', 'advisory-only',
    'supervisorHzMinimum', 200,
    'policyHzApproximate', 50,
    'externalBeta', 'not enabled by this migration; requires post-lab evidence and explicit rollout gate'
  ),
  'docs/DECISIONS.md#project-execution-decisions',
  now()
WHERE NOT EXISTS (
  SELECT 1
    FROM platform_gate_signoffs
   WHERE gate_key = 'd28.hardware'
     AND policy_version = 'd30-d28-lab-signoff-2026-06-14'
     AND status = 'accepted'
);
