[Setup]
AppId=RockLea Collector
AppName=RockLea
AppVersion=0.2.0
AppPublisher=RockLea
ArchitecturesAllowed=x64compatible
DefaultDirName={localappdata}\Programs\RockLea
DefaultGroupName=RockLea
PrivilegesRequired=lowest
OutputDir=..\release
OutputBaseFilename=RockLea-Setup
Compression=lzma2
SolidCompression=yes
UninstallDisplayIcon={app}\RockLea.exe
AppMutex=Local\RockLea
CloseApplications=no
RestartApplications=no
MinVersion=10.0
[Tasks]
Name: "desktopicon"; Description: "Desktop-Verknüpfung erstellen"; Flags: unchecked
Name: "autostart"; Description: "RockLea mit Windows starten"; Flags: unchecked
[Files]
Source: "..\release\host\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{group}\RockLea"; Filename: "{app}\RockLea.exe"
Name: "{autodesktop}\RockLea"; Filename: "{app}\RockLea.exe"; Tasks: desktopicon
[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "RockLea"; ValueData: """{app}\RockLea.exe"" --tray"; Tasks: autostart; Flags: uninsdeletevalue
[Run]
Filename: "{app}\RockLea.exe"; Description: "RockLea starten"; Flags: postinstall nowait skipifsilent
Filename: "{app}\RockLea.exe"; Flags: nowait; Check: IsUpdateRestart
[Code]
function IsUpdateRestart: Boolean;
begin
  Result := ExpandConstant('{param:ROCKLEARESTART|0}') = '1';
end;
[UninstallRun]
Filename: "{app}\RockLea.exe"; Parameters: "--no-autostart"; Flags: runhidden
