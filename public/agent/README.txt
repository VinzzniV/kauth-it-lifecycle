IT Lifecycle Agent - Pilot
==========================

1. Download Invoke-ItLifecycleAgent.ps1 and an exported job JSON from the portal.
2. Copy both files to PK-SRVMGMT002.
3. Open Windows PowerShell as the intended operator.
4. Dry run (default):
   .\Invoke-ItLifecycleAgent.ps1 -JobPath .\lifecycle-job.json
5. Real execution after reviewing the result:
   .\Invoke-ItLifecycleAgent.ps1 -JobPath .\lifecycle-job.json -Mode Execute -Confirm

Security:
- The portal never receives or stores passwords.
- AD and HelpDesk credentials are requested locally for each run.
- Use a delegated test account. Domain Admin is technically accepted but not recommended.
- New AD accounts are created disabled. Enabling and initial-password handling are deliberately outside this pilot.
- Execute mode asks for confirmation before each change.

Prerequisites:
- ActiveDirectory PowerShell module
- Network access to kauth.local and http://pk-srvhlpdsk001:8002
- Approved target OU in the job JSON for onboarding

