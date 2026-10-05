param([Parameter(Mandatory=$true)][string]$VhdPath, [string]$ResultPath)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
try {
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class WcsVirtualDisk {
    [StructLayout(LayoutKind.Sequential)]
    struct StorageType { public uint DeviceId; public Guid VendorId; }
    [StructLayout(LayoutKind.Sequential)]
    struct OpenParameters { public uint Version; public uint RWDepth; }
    [DllImport("virtdisk.dll", CharSet = CharSet.Unicode)]
    static extern uint OpenVirtualDisk(ref StorageType type, string path, uint access, uint flags, ref OpenParameters parameters, out IntPtr handle);
    [DllImport("virtdisk.dll")]
    static extern uint CompactVirtualDisk(IntPtr handle, uint flags, IntPtr parameters, IntPtr overlapped);
    [DllImport("kernel32.dll")]
    static extern bool CloseHandle(IntPtr handle);
    public static void Compact(string path) {
        var type = new StorageType();
        var parameters = new OpenParameters { Version = 1, RWDepth = 1 };
        IntPtr handle;
        uint result = OpenVirtualDisk(ref type, path, 0x00200000, 0, ref parameters, out handle);
        if (result != 0) throw new Win32Exception((int)result);
        try {
            result = CompactVirtualDisk(handle, 0, IntPtr.Zero, IntPtr.Zero);
            if (result != 0) throw new Win32Exception((int)result);
        } finally { CloseHandle(handle); }
    }
}
'@
    # Require exclusive access. The virtual disk API also rejects disks in use.
    $probe = [System.IO.File]::Open($VhdPath, 'Open', 'ReadWrite', 'None')
    $probe.Dispose()
    [WcsVirtualDisk]::Compact($VhdPath)
    $result = @{ ok = $true } | ConvertTo-Json -Compress
    if ($ResultPath) { [IO.File]::WriteAllText($ResultPath, $result, [Text.UTF8Encoding]::new($false)) }
    else { $result }
} catch {
    $cause = $_.Exception
    while ($cause.InnerException) { $cause = $cause.InnerException }
    $result = @{ ok = $false; error = $cause.Message; code = $cause.NativeErrorCode; line = $_.InvocationInfo.ScriptLineNumber } | ConvertTo-Json -Compress
    if ($ResultPath) { [IO.File]::WriteAllText($ResultPath, $result, [Text.UTF8Encoding]::new($false)) }
    else { $result }
    exit 1
}
