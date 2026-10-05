param([Parameter(Mandatory=$true)][string]$VhdPath, [Parameter(Mandatory=$true)][string]$ResultPath)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
try {
    # Escape PowerShell string literals before passing an encoded command.
    $helper = (Join-Path $PSScriptRoot 'compact-vhd.ps1').Replace("'", "''")
    $disk = $VhdPath.Replace("'", "''")
    $output = $ResultPath.Replace("'", "''")
    $command = "& '$helper' -VhdPath '$disk' -ResultPath '$output'"
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
    $child = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $encoded)
    exit $child.ExitCode
} catch {
    @{ ok = $false; error = $_.Exception.Message; code = 1223 } | ConvertTo-Json -Compress
    exit 1
}
