interface Props {
  level: 'high' | 'medium' | 'low';
}

const config = {
  high: { label: '위험', solidBg: 'var(--red-solid-bg)', solidText: 'var(--red-solid-text)' },
  medium: { label: '주의', solidBg: 'var(--orange-solid-bg)', solidText: 'var(--orange-solid-text)' },
  low: { label: '양호', solidBg: 'var(--green-solid-bg)', solidText: 'var(--green-solid-text)' },
};

export default function RiskBadge({ level }: Props) {
  const c = config[level];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 10px',
        borderRadius: 'var(--radius-pill)',
        fontSize: 12,
        fontWeight: 600,
        background: c.solidBg,
        color: c.solidText,
      }}
    >
      {c.label}
    </span>
  );
}
