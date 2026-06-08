$ErrorActionPreference = 'Stop'

$apiBaseUrl = if ($env:RUNLANE_VALIDATE_API_URL) { $env:RUNLANE_VALIDATE_API_URL } else { 'http://localhost:4600' }
$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$email = if ($env:RUNLANE_VALIDATE_EMAIL) { $env:RUNLANE_VALIDATE_EMAIL } else { "commit10-$timestamp@runlane.local" }
$password = if ($env:RUNLANE_VALIDATE_PASSWORD) { $env:RUNLANE_VALIDATE_PASSWORD } else { 'RunlanePassword123!' }
$name = if ($env:RUNLANE_VALIDATE_NAME) { $env:RUNLANE_VALIDATE_NAME } else { 'Runlane Operator' }

$payload = @{
  email = $email
  password = $password
  name = $name
} | ConvertTo-Json

$response = Invoke-RestMethod -Method Post -Uri "$apiBaseUrl/v1/auth/register" -ContentType 'application/json' -Body $payload

if (-not $response.user.id) {
  throw 'Registration response does not include a user id.'
}

if (-not $response.workspace.id) {
  throw 'Registration response does not include a workspace id.'
}

if ($response.workspace.role -ne 'owner') {
  throw 'Registration response does not include the owner workspace role.'
}

New-Item -ItemType Directory -Force -Path '.run' | Out-Null

$env:RUNLANE_REGISTRATION_EMAIL = $email
$env:RUNLANE_REGISTRATION_USER_ID = $response.user.id
$env:RUNLANE_REGISTRATION_WORKSPACE_ID = $response.workspace.id

$nodeScriptPath = '.run/validate-registration.mjs'
$nodeScript = @'
import { PrismaClient } from '../scripts/prisma-client-loader.mjs';

const prisma = new PrismaClient();
const email = process.env.RUNLANE_REGISTRATION_EMAIL;
const expectedUserId = process.env.RUNLANE_REGISTRATION_USER_ID;
const expectedWorkspaceId = process.env.RUNLANE_REGISTRATION_WORKSPACE_ID;

try {
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      workspaceMemberships: {
        include: {
          workspace: true,
        },
      },
    },
  });

  if (!user) {
    throw new Error('Registered user was not found in the database.');
  }

  if (user.id !== expectedUserId) {
    throw new Error('Registered user id does not match the API response.');
  }

  const membership = user.workspaceMemberships.find((item) => item.workspaceId === expectedWorkspaceId);

  if (!membership) {
    throw new Error('Owner workspace membership was not found in the database.');
  }

  if (membership.role !== 'OWNER') {
    throw new Error('Workspace membership role is not OWNER.');
  }

  if (membership.workspace.ownerId !== user.id) {
    throw new Error('Workspace owner does not match the registered user.');
  }

  console.log(JSON.stringify({ userId: user.id, workspaceId: membership.workspaceId, email: user.email }));
} finally {
  await prisma.$disconnect();
}
'@

Set-Content -Path $nodeScriptPath -Value $nodeScript
node $nodeScriptPath
Remove-Item $nodeScriptPath -Force
