'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import type { Student, TestScore, WrongAnswer, Attendance, StudentMemo, CoachingReport } from '@/lib/types';
import {
  calculateRiskLevel,
  calculateAvgScore,
  calculateSubjectAverages,
  calculateDailyAverages,
  trackTags,
} from '@/lib/analysis';
import ScoreTrendChart from '@/components/charts/ScoreTrendChart';
import SubjectRadarChart from '@/components/charts/SubjectRadarChart';
import RiskBadge from '@/components/RiskBadge';

interface Props {
  student: Student;
  scores: TestScore[];
  wrongAnswers: WrongAnswer[];
  attendance: Attendance[];
  memos: StudentMemo[];
  coachingReports: CoachingReport[];
}

export default function StudentDetailClient({
  student,
  scores,
  wrongAnswers,
  attendance,
  memos,
  coachingReports,
}: Props) {
  const avgScore = useMemo(() => calculateAvgScore(scores), [scores]);
  const riskLevel = useMemo(() => calculateRiskLevel(scores, attendance), [scores, attendance]);
  const subjectAverages = useMemo(() => calculateSubjectAverages(scores), [scores]);
  const dailyAverages = useMemo(() => calculateDailyAverages(scores), [scores]);

  // 태그 추적: 최근 시험 vs 이전 시험
  const tagTracking = useMemo(() => {
    if (wrongAnswers.length === 0) return null;
    const dates = [...new Set(wrongAnswers.map((w) => w.test_date))].sort().reverse();
    if (dates.length < 2) return null;
    const current = wrongAnswers.filter((w) => w.test_date === dates[0]);
    const previous = wrongAnswers.filter((w) => w.test_date !== dates[0]);
    return trackTags(previous, current);
  }, [wrongAnswers]);

  const absentCount = attendance.filter((a) => a.status === 'absent').length;
  const lateCount = attendance.filter((a) => a.status === 'late').length;

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/students"
          className="text-slate-400 hover:text-slate-600 transition-colors"
        >
          ← 목록
        </Link>
      </div>

      {/* 프로필 카드 */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xl font-bold">
              {student.name[0]}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">{student.name}</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {student.department || '부서 미배정'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-sm text-slate-500">평균</p>
              <p className="text-2xl font-bold text-slate-900">{avgScore}점</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-slate-500">결석</p>
              <p className="text-2xl font-bold text-slate-900">{absentCount}회</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-slate-500">지각</p>
              <p className="text-2xl font-bold text-slate-900">{lateCount}회</p>
            </div>
            <RiskBadge level={riskLevel} />
          </div>
        </div>
      </div>

      {/* 차트 영역 */}
      <div className="grid grid-cols-2 gap-6">
        {/* 점수 추이 */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">점수 추이</h3>
          {dailyAverages.length > 0 ? (
            <ScoreTrendChart data={dailyAverages} />
          ) : (
            <p className="py-12 text-center text-sm text-slate-400">데이터 없음</p>
          )}
        </div>

        {/* 과목별 레이더 */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">과목별 강약점</h3>
          {subjectAverages.length > 0 ? (
            <SubjectRadarChart data={subjectAverages} />
          ) : (
            <p className="py-12 text-center text-sm text-slate-400">데이터 없음</p>
          )}
        </div>
      </div>

      {/* 태그 추적 + 코칭 */}
      <div className="grid grid-cols-2 gap-6">
        {/* 태그 추적 */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">취약 영역 추적</h3>
          {tagTracking ? (
            <div className="space-y-4">
              {tagTracking.overcome.length > 0 && (
                <TagSection
                  title="극복 성공"
                  icon="✅"
                  tags={tagTracking.overcome}
                  color="text-emerald-600 bg-emerald-50"
                />
              )}
              {tagTracking.newWeak.length > 0 && (
                <TagSection
                  title="새로운 약점"
                  icon="⚠️"
                  tags={tagTracking.newWeak}
                  color="text-amber-600 bg-amber-50"
                />
              )}
              {tagTracking.chronic.length > 0 && (
                <TagSection
                  title="고질적 약점"
                  icon="🚨"
                  tags={tagTracking.chronic}
                  color="text-red-600 bg-red-50"
                />
              )}
              {tagTracking.overcome.length === 0 &&
                tagTracking.newWeak.length === 0 &&
                tagTracking.chronic.length === 0 && (
                  <p className="text-sm text-slate-400">태그 변화 없음</p>
                )}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-slate-400">
              2회 이상 시험 데이터가 필요해요
            </p>
          )}
        </div>

        {/* AI 코칭 리포트 */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">AI 코칭 리포트</h3>
          {coachingReports.length > 0 ? (
            <div className="space-y-4">
              {coachingReports.map((report) => (
                <details key={report.id} className="group">
                  <summary className="cursor-pointer flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-all duration-200">
                    <span className="text-sm font-medium text-slate-900">
                      {report.test_date} 분석
                    </span>
                    <span className="text-slate-400 group-open:rotate-180 transition-transform">
                      ▼
                    </span>
                  </summary>
                  <div className="mt-2 p-4 rounded-xl bg-slate-50 text-sm text-slate-700 whitespace-pre-wrap">
                    {report.manager_report}
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-slate-400">아직 코칭 리포트가 없어요</p>
          )}
        </div>
      </div>

      {/* 메모 타임라인 */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">교육 메모</h3>
        {memos.length > 0 ? (
          <div className="space-y-3">
            {memos.map((memo) => (
              <div key={memo.id} className="flex gap-3 p-3 rounded-xl bg-slate-50">
                <div className="text-sm text-slate-400 shrink-0 w-24">{memo.date}</div>
                <div className="text-sm text-slate-700">{memo.content}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-slate-400">메모가 없어요</p>
        )}
      </div>
    </div>
  );
}

function TagSection({
  title,
  icon,
  tags,
  color,
}: {
  title: string;
  icon: string;
  tags: string[];
  color: string;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-slate-700 mb-2">
        {icon} {title}
      </p>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${color}`}
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}
