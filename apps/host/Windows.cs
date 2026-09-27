using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Threading;
using System.Windows.Forms;
using System.Web.Script.Serialization;
using System.Runtime.InteropServices;

[assembly: System.Reflection.AssemblyTitle("RockLea")]
[assembly: System.Reflection.AssemblyProduct("RockLea")]
[assembly: System.Reflection.AssemblyVersion("0.3.1.0")]
[assembly: System.Reflection.AssemblyFileVersion("0.3.1.0")]
namespace RockLea {
  static class Program {
    [DllImport("kernel32.dll")] static extern bool AttachConsole(int pid);
    [STAThread] static int Main(string[] args) {
      if (Array.IndexOf(args,"--version")>=0) { AttachConsole(-1); Console.WriteLine("RockLea 0.3.1"); return 0; }
      if (Array.IndexOf(args,"--no-autostart")>=0) { using(var key=Microsoft.Win32.Registry.CurrentUser.OpenSubKey("Software\\Microsoft\\Windows\\CurrentVersion\\Run",true)) { if(key!=null)key.DeleteValue("RockLea",false); } return 0; }
      if (Array.IndexOf(args,"--smoke")>=0) return Smoke.Run();
      bool created; using(var mutex=new Mutex(true,"Local\\RockLea",out created)) {
        if(!created) { try {EventWaitHandle.OpenExisting("Local\\RockLea-Focus-"+Environment.UserName).Set();} catch {MessageBox.Show("RockLea läuft bereits.","RockLea");} return 0; }
        Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new MainWindow(Array.IndexOf(args,"--tray")>=0));
      } return 0;
    }
  }
  class MainWindow : Form {
    Process host; NotifyIcon tray; Label status,notice; Button update; CheckBox autostart;
    JavaScriptSerializer json=new JavaScriptSerializer(); bool quitting=false,hostReady=false,dashboardPending=false; int port=3000; string pendingInstaller;
    EventWaitHandle focus=new EventWaitHandle(false,EventResetMode.AutoReset,"Local\\RockLea-Focus-"+Environment.UserName);
    System.Windows.Forms.Timer timer=new System.Windows.Forms.Timer();
    Dictionary<string,object> settings=new Dictionary<string,object>();
    public MainWindow(bool minimized) {
      Text="RockLea"; ClientSize=new Size(630,520); MinimumSize=new Size(646,559); StartPosition=FormStartPosition.CenterScreen;
      BackColor=Color.FromArgb(16,23,36); ForeColor=Color.WhiteSmoke; Font=new Font("Segoe UI",10); Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);
      Controls.Add(new Label{Text="RockLea",Font=new Font("Segoe UI",27,FontStyle.Bold),Location=new Point(28,20),AutoSize=true});
      Controls.Add(new Label{Text="DEIN TEAM. EURE STATISTIK.    •    0.3.1",Location=new Point(30,76),AutoSize=true,ForeColor=Color.MediumAquamarine});
      status=new Label{Text="RockLea startet …",Location=new Point(30,119),Size=new Size(565,110),Font=new Font("Segoe UI",12)};Controls.Add(status);
      AddButton("Dashboard öffnen",30,242,Dashboard); AddButton("Einstellungen",225,242,()=>Send("settings"));AddButton("Logs öffnen",420,242,()=>OpenPath(Path.Combine(DataDir,"logs")));
      AddButton("Neu starten",30,287,()=>Send("restart"));AddButton("Backup erstellen",225,287,()=>Send("backup"));AddButton("Stats API einrichten",420,287,()=>Send("game-setup"));
      AddButton("Nach Updates suchen",30,332,()=>Send("check-update"));update=AddButton("Aktualisieren",225,332,()=>{if(MessageBox.Show("Geprüftes Update herunterladen und RockLea neu starten?","RockLea aktualisieren",MessageBoxButtons.YesNo)==DialogResult.Yes)Send("update");}); update.Enabled=false;
      AddButton("Beenden",420,332,Quit);
      autostart=new CheckBox{Text="Mit Windows starten",Location=new Point(30,386),AutoSize=true};autostart.Click+=(s,e)=>Send(new{command="autostart",enabled=autostart.Checked});Controls.Add(autostart);
      notice=new Label{Text="",Location=new Point(30,420),Size=new Size(563,82),ForeColor=Color.LightSteelBlue};Controls.Add(notice);
      tray=new NotifyIcon{Icon=Icon,Text="RockLea",Visible=true};var menu=new ContextMenuStrip();
      menu.Items.Add("Status anzeigen",null,(s,e)=>ShowWindow()); menu.Items.Add("Dashboard öffnen",null,(s,e)=>Dashboard());menu.Items.Add("Logs öffnen",null,(s,e)=>OpenPath(Path.Combine(DataDir,"logs")));menu.Items.Add("Alles neu starten",null,(s,e)=>Send("restart"));menu.Items.Add("Autostart umschalten",null,(s,e)=>Send(new{command="autostart",enabled=!autostart.Checked}));menu.Items.Add("Nach Updates suchen",null,(s,e)=>Send("check-update"));menu.Items.Add("RockLea beenden",null,(s,e)=>Quit());tray.ContextMenuStrip=menu;tray.DoubleClick+=(s,e)=>ShowWindow();
      FormClosing+=(s,e)=>{if(!quitting){e.Cancel=true;Hide();tray.ShowBalloonTip(1800,"RockLea läuft weiter","Über das Tray-Menü vollständig beenden.",ToolTipIcon.Info);}};
      Shown+=(s,e)=>{StartHost();if(minimized)Hide();};
      timer.Interval=500;timer.Tick+=(s,e)=>{if(focus.WaitOne(0))ShowWindow();};timer.Start();
    }
    static string DataDir {get{return Environment.GetEnvironmentVariable("ROCKLEA_DATA_DIR")??Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"RockLea");}}
    Button AddButton(string text,int x,int y,Action action){var b=new Button{Text=text,Location=new Point(x,y),Size=new Size(180,36),FlatStyle=FlatStyle.Flat,BackColor=Color.FromArgb(30,43,62)};b.Click+=(s,e)=>action();Controls.Add(b);return b;}
    void ShowWindow(){Show();WindowState=FormWindowState.Normal;Activate();}
    void OpenPath(string path){try{Process.Start(new ProcessStartInfo(path){UseShellExecute=true});}catch{notice.Text="Ordner/Browser konnte nicht geöffnet werden.";}}
    void Dashboard(){if(!hostReady){dashboardPending=true;notice.Text="Backend startet noch. Dashboard wird danach geöffnet.";return;}dashboardPending=false;OpenPath("http://localhost:"+port);}
    void StartHost(){
      try{
        string root=AppDomain.CurrentDomain.BaseDirectory;
        var start=new ProcessStartInfo(Path.Combine(root,"runtime","node.exe"),"dist/apps/host/main.js"){WorkingDirectory=Path.Combine(root,"runtime","app"),UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,StandardOutputEncoding=System.Text.Encoding.UTF8,StandardErrorEncoding=System.Text.Encoding.UTF8};
        start.EnvironmentVariables["ROCKLEA_INSTALL_DIR"]=root;start.EnvironmentVariables["NODE_OPTIONS"]="";
        host=new Process{StartInfo=start,EnableRaisingEvents=true};host.OutputDataReceived+=(s,e)=>{if(e.Data!=null&&!IsDisposed)try{BeginInvoke((Action)(()=>Receive(e.Data)));}catch{}};
        host.ErrorDataReceived+=(s,e)=>{};
        host.Exited+=(s,e)=>{try{BeginInvoke((Action)(()=>{hostReady=false;if(quitting){Finish();return;}status.Text="Host beendet";notice.Text="RockLea erneut starten. Die lokalen Daten bleiben erhalten.";}));}catch{}};
        host.Start();host.BeginOutputReadLine();host.BeginErrorReadLine();
      }catch{status.Text="Start fehlgeschlagen";notice.Text="Installation unvollständig. RockLea-Setup erneut ausführen.";}
    }
    void Send(string command){Send(new{command=command});}
    void Send(object command){try{if(host!=null&&!host.HasExited){host.StandardInput.WriteLine(json.Serialize(command));host.StandardInput.Flush();}}catch{notice.Text="Host nicht erreichbar.";}}
    static string Get(Dictionary<string,object> value,string key,string fallback=""){object found;return value.TryGetValue(key,out found)&&found!=null?Convert.ToString(found):fallback;}
    void Receive(string line){
      Dictionary<string,object> msg;try{msg=json.Deserialize<Dictionary<string,object>>(line);}catch{return;}
      string type=Get(msg,"type");
      if(type=="notice"){notice.Text=Get(msg,"message");return;}
      if(type=="settings"){settings=msg;Setup();return;}
      if(type=="install"){pendingInstaller=Get(msg,"path");Quit();return;}
      if(type!="state")return;
      int.TryParse(Get(msg,"port","3000"),out port);autostart.Checked=Get(msg,"autostart")=="True";
      var components=msg["components"] as Dictionary<string,object>;string text="";hostReady=false;
      foreach(string key in new[]{"backend","discord","collector"}){
        var component=components!=null&&components.ContainsKey(key)?components[key] as Dictionary<string,object>:new Dictionary<string,object>();
        string label=Get(component,"status","Wartet auf Einrichtung");text+=(key=="backend"?"Backend":key=="discord"?"Discord Bot":"Collector")+"       "+label+Environment.NewLine;
        if(key=="backend")hostReady=label=="Online";
        if(key=="collector")text+="Rocket League    "+(Get(component,"gameConnected")=="True"?"Verbunden":"Wartet")+"   •   Puffer: "+Get(component,"queueDepth","0");
      }
      status.Text=text;string version=Get(msg,"update");update.Enabled=version!="";if(version!="")notice.Text="Neue Version verfügbar: "+version;
      if(hostReady&&dashboardPending)Dashboard();
      if(Get(msg,"configured")=="False"&&!setupOpen&&!setupOffered){notice.Text="Einmalig einrichten oder bestehende Installation importieren.";settings=new Dictionary<string,object>();setupOffered=true;Setup();}
    }
    bool setupOpen=false, setupOffered=false;
    void Setup(){
      if(setupOpen)return;setupOpen=true;
      using(var form=new Form{Text="RockLea einrichten",ClientSize=new Size(570,570),StartPosition=FormStartPosition.CenterParent,BackColor=BackColor,ForeColor=ForeColor,Font=Font,FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false,MinimizeBox=false}){
        form.Controls.Add(new Label{Text="Discord verbinden",Font=new Font("Segoe UI",20,FontStyle.Bold),Location=new Point(22,18),AutoSize=true});
        var fields=new Dictionary<string,TextBox>();int y=76;
        foreach(string field in new[]{"discordToken","clientId","clientSecret","guildId","port","githubToken"}){
          string label=field=="discordToken"?"Bot Token":field=="clientId"?"Client ID":field=="clientSecret"?"Client Secret":field=="guildId"?"Server ID":field=="port"?"Lokaler Port":"GitHub Lese-Token (privates Repo)";
          form.Controls.Add(new Label{Text=label,Location=new Point(24,y+4),Size=new Size(240,24)});
          var box=new TextBox{Location=new Point(270,y),Size=new Size(270,28),UseSystemPasswordChar=field.Contains("Token")||field=="clientSecret",Text=Get(settings,field,field=="port"?"3000":""),MaxLength=512};fields.Add(field,box);form.Controls.Add(box);y+=43;
        }
        var redirect=new Label{Text="OAuth Redirect: http://localhost:"+fields["port"].Text+"/auth/callback",Location=new Point(24,345),Size=new Size(518,44)};form.Controls.Add(redirect);fields["port"].TextChanged+=(s,e)=>redirect.Text="OAuth Redirect: http://localhost:"+fields["port"].Text+"/auth/callback";
        form.Controls.Add(new Label{Text="Secrets werden mit Windows DPAPI verschlüsselt.\nLeere Secret-Felder behalten bei Änderungen den bisherigen Wert.",Location=new Point(24,390),Size=new Size(515,46)});
        var save=new Button{Text="Prüfen und speichern",Location=new Point(24,445),Size=new Size(240,36),BackColor=Color.FromArgb(30,43,62)};save.Click+=(s,e)=>{int selectedPort;if(!int.TryParse(fields["port"].Text,out selectedPort)){MessageBox.Show("Gültigen Port eingeben.");return;}var values=new Dictionary<string,object>();foreach(var f in fields)if(f.Value.Text.Trim()!="")values[f.Key]=f.Key=="port"?(object)selectedPort:f.Value.Text.Trim();values["autostart"]=autostart.Checked;Send(new{command="configure",config=values});form.Close();};form.Controls.Add(save);
        var import=new Button{Text="Bestehende Installation importieren",Location=new Point(280,445),Size=new Size(260,36)};
        import.Click+=(s,e)=>{if(MessageBox.Show("Alle alten Backend-, Bot- und Collector-Prozesse zuerst beenden. Originaldateien bleiben erhalten. Fortfahren?","Import",MessageBoxButtons.YesNo)!=DialogResult.Yes)return;using(var picker=new FolderBrowserDialog{Description="Alten RockLea-Ordner mit .env und data auswählen"})if(picker.ShowDialog(form)==DialogResult.OK){Send(new{command="import",path=picker.SelectedPath});form.Close();}};form.Controls.Add(import);
        var portal=new LinkLabel{Text="Discord Developer Portal öffnen",LinkColor=Color.MediumAquamarine,Location=new Point(24,502),AutoSize=true};portal.LinkClicked+=(s,e)=>OpenPath("https://discord.com/developers/applications");form.Controls.Add(portal);
        form.ShowDialog(this);
      }setupOpen=false;
    }
    void Quit(){if(quitting)return;quitting=true;notice.Text="RockLea wird sauber beendet …";Enabled=false;if(host==null||host.HasExited){Finish();return;}Send("quit");}
    void Finish(){
      timer.Stop();focus.Dispose();tray.Visible=false;tray.Dispose();
      if(!string.IsNullOrEmpty(pendingInstaller)){
        try{Process.Start(new ProcessStartInfo(pendingInstaller,"/SILENT /SUPPRESSMSGBOXES /NORESTART /ROCKLEARESTART=1 /DIR=\""+AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\')+"\""){UseShellExecute=true});}catch{MessageBox.Show("Installer konnte nicht gestartet werden. Das geprüfte Update liegt im lokalen RockLea-Updateordner.");}
      }
      Close();Application.Exit();
    }
  }
  static class Smoke {
    public static int Run(){
      string root=AppDomain.CurrentDomain.BaseDirectory;
      try{
        var p=Process.Start(new ProcessStartInfo(Path.Combine(root,"runtime","node.exe"),"dist/apps/host/smoke.js"){WorkingDirectory=Path.Combine(root,"runtime","app"),UseShellExecute=false,CreateNoWindow=true});
        if(!p.WaitForExit(60000)){p.Kill();return 2;}return p.ExitCode;
      }catch{return 1;}
    }
  }
}
