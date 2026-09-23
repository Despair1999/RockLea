[Setup]
AppName=RockLea Collector
AppVersion=0.1.0
AppPublisher=RockLea
DefaultDirName={localappdata}\Programs\RockLea
DefaultGroupName=RockLea
PrivilegesRequired=lowest
OutputDir=..\release
OutputBaseFilename=RLStatsCollector-Setup
Compression=lzma2
SolidCompression=yes
UninstallDisplayIcon={app}\RLStatsCollector.exe
[Files]
Source: "..\release\RLStatsCollector.exe"; DestDir: "{app}"; Flags: ignoreversion
[Icons]
Name: "{group}\RockLea Collector"; Filename: "{app}\RLStatsCollector.exe"
Name: "{group}\RockLea einrichten"; Filename: "{app}\RLStatsCollector.exe"; Parameters: "--setup"
[Run]
Filename: "{app}\RLStatsCollector.exe"; Parameters: "--setup"; Description: "Collector mit Discord verbinden"; Flags: postinstall skipifsilent
[UninstallRun]
Filename: "{app}\RLStatsCollector.exe"; Parameters: "--no-autostart"; Flags: runhidden
