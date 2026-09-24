import { useState } from 'react';
import { Database, Download, Upload, AlertTriangle } from 'lucide-react';
import { save, open } from '@tauri-apps/plugin-dialog';
import { copyFile } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';

export default function BackupRestore() {
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
    <div className="p-8 h-full bg-slate-50 flex flex-col items-center justify-center">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-800 p-8 text-center">
          <div className="w-16 h-16 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-600">
            <Database className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Data Backup & Restore</h1>
          <p className="text-slate-400 mt-2">Secure your data or restore from a previous backup</p>
        </div>

        <div className="p-8">
          {status && (
            <div className={`mb-8 p-4 rounded-xl border flex items-start ${
              status.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
            }`}>
              {status.type === 'error' && <AlertTriangle className="w-5 h-5 mr-3 shrink-0 mt-0.5" />}
              <p className="font-medium">{status.message}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <button
              onClick={handleBackup}
              disabled={isLoading}
              className="group relative overflow-hidden bg-slate-50 border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl p-8 flex flex-col items-center justify-center transition-all hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Download className="w-6 h-6 text-blue-600" />
              </div>
              <h2 className="text-lg font-bold text-slate-800">Create Backup</h2>
              <p className="text-sm text-slate-500 text-center mt-2">Save a copy of your database to an external drive</p>
            </button>

            <button
              onClick={handleRestore}
              disabled={isLoading}
              className="group relative overflow-hidden bg-slate-50 border-2 border-dashed border-slate-300 hover:border-red-500 rounded-2xl p-8 flex flex-col items-center justify-center transition-all hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Upload className="w-6 h-6 text-red-600" />
              </div>
              <h2 className="text-lg font-bold text-slate-800">Restore Data</h2>
              <p className="text-sm text-slate-500 text-center mt-2">Replace current data with a previous backup file</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
