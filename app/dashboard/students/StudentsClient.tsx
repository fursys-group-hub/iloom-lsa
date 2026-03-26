'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Student, TestScore, Attendance } from '@/lib/types';
import { calculateRiskLevel, calculateAvgScore } from '@/lib/analysis';
import RiskBadge from '@/components/RiskBadge';

interface Props {
  students: Student[];
  scores: TestScore[];
  attendance: Attendance[];
}

export default function StudentsClient({ students, scores, attendance }: Props) {
  const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [search, setSearch] = useState('');

  const studentsWithStats = useMemo(() => {
    return students.map((student) => {
      const studentScores = scores.filter((s) => s.student_id === student.id);
      const studentAttendance = attendance.filter((a) => a.student_id === student.id);
      const avgScore = calculateAvgScore(studentScores);
      const riskLevel = calculateRiskLevel(studentScores, studentAttendance);
      const absentCount = studentAttendance.filter((a) => a.status === 'absent').length;
      const lateCount = studentAttendance.filter((a) => a.status === 'late').length;
      return {
        ...student, avg_score: avgScore, risk_level: riskLevel,
        absent_count: absentCount, late_count: lateCount, recent_scores: studentScores,
      };
    });
  }, [students, scores, attendance]);

  const filtered = useMemo(() => {
    return studentsWithStats.filter((s) => {
      if (filter !== 'all' && s.risk_level !== filter) return false;
      if (search && !s.name.includes(search)) return false;
      return true;
    });
  }, [studentsWithStats, filter, search]);

  return (
    <div className="space-y-8">
      <h2 className="text-3xl font-bold text-slate-900">교육생 관리</h2>

      {/* 필터 */}
      <div className="flex items-center gap-4">
        <input
          type="text"
          placeholder="이름 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-xl border border-slate-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-72"
        />
        <div className="flex gap-2">
          {(['all', 'high', 'medium', 'low'] as const).map((level) => (
            <button
              key={level}
              onClick={() => setFilter(level)}
              className={`px-4 py-2 rounded-lg text-base font-medium transition-all duration-200 ${
                filter === level
                  ? 'bg-blue-500 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {level === 'all' ? '전체' : level === 'high' ? '위험' : level === 'medium' ? '주의' : '양호'}
            </button>
          ))}
        </div>
      </div>

      {/* 테이블 */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left px-6 py-4 text-base font-semibold text-slate-600">이름</th>
              <th className="text-left px-6 py-4 text-base font-semibold text-slate-600">부서</th>
              <th className="text-center px-6 py-4 text-base font-semibold text-slate-600">평균 점수</th>
              <th className="text-center px-6 py-4 text-base font-semibold text-slate-600">결석</th>
              <th className="text-center px-6 py-4 text-base font-semibold text-slate-600">지각</th>
              <th className="text-center px-6 py-4 text-base font-semibold text-slate-600">상태</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr
                key={s.id}
                className="border-b border-slate-50 hover:bg-slate-50 transition-all duration-200"
              >
                <td className="px-6 py-4">
                  <Link
                    href={`/dashboard/students/${s.id}`}
                    className="flex items-center gap-3 font-medium text-slate-900 hover:text-blue-600"
                  >
                    <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-base font-semibold">
                      {s.name[0]}
                    </div>
                    <span className="text-base">{s.name}</span>
                  </Link>
                </td>
                <td className="px-6 py-4 text-base text-slate-600">{s.department || '-'}</td>
                <td className="px-6 py-4 text-center text-base font-medium text-slate-900">
                  {s.avg_score}점
                </td>
                <td className="px-6 py-4 text-center text-base text-slate-600">{s.absent_count}회</td>
                <td className="px-6 py-4 text-center text-base text-slate-600">{s.late_count}회</td>
                <td className="px-6 py-4 text-center">
                  <RiskBadge level={s.risk_level} />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-base text-slate-400">
                  교육생 데이터가 없어요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
