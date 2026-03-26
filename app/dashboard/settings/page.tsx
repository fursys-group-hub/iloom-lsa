'use client';

import { useState } from 'react';

export default function SettingsPage() {
  const [sheetId, setSheetId] = useState('1_2pc1Mr05DeZMPdaILpPKtOhAsD53XtIWHHJpLqBRtI');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);

    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetId }),
      });

      const data = await res.json();
      setSyncResult({
        success: res.ok,
        message: data.message || (res.ok ? '동기화 완료!' : '동기화 실패'),
      });
    } catch {
      setSyncResult({ success: false, message: '네트워크 오류' });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900">설정</h2>

      {/* Google Sheets 연동 */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6 space-y-4">
        <h3 className="text-lg font-semibold text-slate-900">Google Sheets 연동</h3>
        <p className="text-sm text-slate-500">
          구글 폼 응답이 기록되는 Google Sheets ID를 입력하고 동기화하세요.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Sheet ID
            </label>
            <input
              type="text"
              value={sheetId}
              onChange={(e) => setSheetId(e.target.value)}
              placeholder="1_2pc1Mr05DeZMPdaILpPKtOhAsD53XtIWHHJpLqBRtI"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSync}
              disabled={syncing || !sheetId}
              className="bg-blue-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {syncing ? '동기화 중...' : '동기화 시작'}
            </button>

            {syncResult && (
              <p
                className={`text-sm font-medium ${
                  syncResult.success ? 'text-emerald-600' : 'text-red-600'
                }`}
              >
                {syncResult.message}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 환경변수 안내 */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6 space-y-3">
        <h3 className="text-lg font-semibold text-slate-900">환경 변수 안내</h3>
        <p className="text-sm text-slate-500">
          아래 환경 변수들이 <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">.env.local</code>에 설정되어 있어야 합니다.
        </p>
        <div className="bg-slate-50 rounded-xl p-4 font-mono text-sm text-slate-700 space-y-1">
          <p>NEXT_PUBLIC_SUPABASE_URL</p>
          <p>NEXT_PUBLIC_SUPABASE_ANON_KEY</p>
          <p>SUPABASE_SERVICE_ROLE_KEY</p>
          <p>GOOGLE_SHEETS_API_KEY</p>
        </div>
      </div>
    </div>
  );
}
