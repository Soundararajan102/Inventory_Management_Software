import { useState } from 'react';
import { Database, Download, Upload, AlertTriangle } from 'lucide-react';
import { save, open } from '@tauri-apps/plugin-dialog';
import { copyFile } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';

export default function BackupRestore() {
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hideShortcuts, setHideShortcuts] = useState(() => {
    return localStorage.getItem('hideShortcuts') === 'true';
  });

  const toggleShortcuts = () => {
    const newValue = !hideShortcuts;
    setHideShortcuts(newValue);
    if (newValue) {
      localStorage.setItem('hideShortcuts', 'true');
    } else {
      localStorage.removeItem('hideShortcuts');
    }
    window.dispatchEvent(new Event('preferencesUpdated'));
  };

  const handleBackup = async () => {
    try {
      setIsLoading(true);
      setStatus(null);
      
      const savePath = await save({
        filters: [{
          name: 'SQLite Database',
          extensions: ['db']
        }],
        defaultPath: 'inventory_backup.db'
      });

      if (!savePath) {
        setIsLoading(false);
        return;
      }

      // We need to copy from appDataDir/inventory.db to the chosen savePath.
      const appDataDirPath = await appDataDir();
      const sourcePath = await join(appDataDirPath, 'inventory.db');

      await copyFile(sourcePath, savePath);

      setStatus({ type: 'success', message: `Database successfully backed up to ${savePath}` });
    } catch (e: any) {
      console.error(e);
      const errorMessage = typeof e === 'string' ? e : (e?.message || 'Failed to create backup');
      setStatus({ type: 'error', message: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!confirm('WARNING: Restoring a backup will overwrite all current data. This action cannot be undone. Do you wish to continue?')) {
      return;
    }

    try {
      setIsLoading(true);
      setStatus(null);

      const openPath = await open({
        filters: [{
          name: 'SQLite Database',
          extensions: ['db']
        }],
        multiple: false
      });

      if (!openPath) {
        setIsLoading(false);
        return;
      }

      const appDataDirPath = await appDataDir();
      const destPath = await join(appDataDirPath, 'inventory.db');

      // Copy the selected backup file over the current database
      await copyFile(openPath as string, destPath);

      setStatus({ type: 'success', message: 'Database successfully restored! Please restart the application to apply changes.' });
      
      // Optionally, we could force reload the window to re-init the DB
      setTimeout(() => {
        window.location.reload();
      }, 3000);

    } catch (e: any) {
      console.error(e);
      const errorMessage = typeof e === 'string' ? e : (e?.message || 'Failed to restore backup');
      setStatus({ type: 'error', message: errorMessage });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-8 h-full bg-canvas overflow-y-auto flex flex-col items-center">
      <div className="max-w-3xl w-full flex flex-col pb-12 shrink-0">
        <div className="w-full mb-12">
          <h1 className="text-4xl font-display font-medium text-ink tracking-tight">Settings</h1>
          <p className="text-base text-body mt-2">Manage your app preferences and database backups.</p>
        </div>

      <div className="max-w-3xl w-full bg-canvas rounded-xl shadow-sm border border-hairline overflow-hidden mb-8">
        <div className="p-6 border-b border-hairline bg-surface-soft">
          <h2 className="text-lg font-bold text-ink">User Preferences</h2>
          <p className="text-sm text-muted mt-1">Customize your UI experience</p>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between p-4 bg-canvas border border-hairline rounded-lg">
            <div>
              <p className="font-bold text-ink">Keyboard Shortcuts in Sidebar</p>
              <p className="text-sm text-muted">Show the shortcut hints (^1, ^2) next to menu items</p>
            </div>
            <button
              onClick={toggleShortcuts}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${!hideShortcuts ? 'bg-primary' : 'bg-surface-strong'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-canvas transition-transform ${!hideShortcuts ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>
      </div>


      <div className="max-w-3xl w-full bg-canvas rounded-xl shadow-sm border border-hairline overflow-hidden">
        <div className="p-6 border-b border-hairline bg-surface-soft flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <Database className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-ink">Data Backup & Restore</h2>
            <p className="text-sm text-muted">Secure your data or restore from a previous backup</p>
          </div>
        </div>

        <div className="p-8">
          {status && (
            <div className={`mb-8 p-4 rounded-xl border flex items-start ${
              status.type === 'success' ? 'bg-success/10 border-success/30 text-success' : 'bg-signature-coral/10 border-signature-coral/30 text-signature-coral'
            }`}>
              {status.type === 'error' && <AlertTriangle className="w-5 h-5 mr-3 shrink-0 mt-0.5" />}
              <p className="font-medium">{status.message}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <button
              onClick={handleBackup}
              disabled={isLoading}
              className="group relative overflow-hidden bg-canvas border border-hairline hover:border-primary rounded-xl p-8 flex flex-col items-center justify-center transition-all hover:bg-surface-soft hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Download className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-ink">Create Backup</h2>
              <p className="text-sm text-muted text-center mt-2">Save a copy of your database to an external drive</p>
            </button>

            <button
              onClick={handleRestore}
              disabled={isLoading}
              className="group relative overflow-hidden bg-canvas border border-hairline hover:border-signature-coral rounded-xl p-8 flex flex-col items-center justify-center transition-all hover:bg-surface-soft hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="w-12 h-12 bg-signature-coral/10 text-signature-coral rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Upload className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-ink">Restore Data</h2>
              <p className="text-sm text-muted text-center mt-2">Replace current data with a previous backup file</p>
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
