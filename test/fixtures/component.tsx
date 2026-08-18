type Props = {
  label: string;
};

// gloss
export const Badge = ({ label }: Props) => {
  return <span className="badge">{label}</span>;
};

export function Panel({ label }: Props) {
  return (
    <div>
      {/* jsx note */}
      <Badge label={label} />
    </div>
  );
}
