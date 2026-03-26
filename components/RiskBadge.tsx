interface Props {
  level: 'high' | 'medium' | 'low';
}

const config = {
  high: { label: '위험', bg: 'var(--red-dim)', color: 'var(--red)' },
  medium: { label: '주의', bg: 'var(--orange-dim)', color: 'var(--orange)' },
  low: { label: '양호', bg: 'var(--green-dim)', color: 'var(--green)' },
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
        background: c.bg,
        color: c.color,
      }}
    >
      {c.label}
    </span>
  );
}
