IT Lifecycle Agent - Pilot
==========================

1. Download Invoke-ItLifecycleAgent.ps1 and an exported job JSON from the portal.
2. Copy both files to PK-SRVMGMT002.
3. Open Windows PowerShell as the intended operator.
4. Dry run (default):
   .\Invoke-ItLifecycleAgent.ps1 -JobPath .\lifecycle-job.json
5. Real execution after reviewing the result:
   .\Invoke-ItLifecycleAgent.ps1 -JobPath .\lifecycle-job.json -Mode Execute -Confirm
6. The matching *.result.json contains every actual or simulated change, the affected object, its employee relationship, before/after values and its rollback action.

Security:
- The portal forwards passwords only for the current job and never writes them to the employee record, job file or result.
- AD and HelpDesk use separate transient Windows credentials. The HelpDesk account needs ticket permissions but no AD administration rights.
- Use a delegated test account. Domain Admin is technically accepted but not recommended.
- New AD accounts receive the one-time initial password, are enabled and require a password change at first logon.
- The portal shows the complete preview before the operator explicitly starts Execute mode.

Prerequisites:
- ActiveDirectory PowerShell module
- Network access to kauth.local and http://pk-srvhlpdsk001:8002
- Approved target OU in the job JSON for onboarding

Direct start from the portal (optional pilot gateway):
- Run Start-ItLifecycleGateway.ps1 interactively on PK-SRVMGMT002.
- Connect its localhost listener through a private Sites tunnel as `management_agent`.
- Configure the same gateway token as the Sites secret MANAGEMENT_AGENT_TOKEN.
- The gateway accepts WhatIf, Execute and rollback jobs. The portal supplies separate one-time AD and HelpDesk credentials for real runs.
- The portal polls the authenticated /results endpoint and stores the returned result in the employee record.
- Failed actions can be retried as a single linked execution. HelpDesk-only retries skip AD module loading and do not require an AD credential.
- HelpDesk tickets contain the current task list and a tokenized status link. Configure the target HelpDesk resource in the portal under Stammdaten > HelpDesk; the agent then requests immediate dispatch when a resource is available.
- Rollback reverses only changes recorded by that exact execution. Helpdesk tickets without a confirmed cancellation API remain documented as manual follow-up.
- Never publish port 8788 directly to the internet.
