interface CastProgressToastProps {
  currentThrow: number;
  isAnimating: boolean;
}

export default function CastProgressToast({ currentThrow, isAnimating }: CastProgressToastProps) {
  const label = isAnimating ? '铜钱落定中' : `第 ${currentThrow} 掷 / 共 6 掷`;

  return (
    <div className="castProgressToast" role="status" aria-live="polite">
      {label}
    </div>
  );
}
