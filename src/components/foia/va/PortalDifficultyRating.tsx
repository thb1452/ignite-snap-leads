import { useState } from 'react';
import { Star } from 'lucide-react';
import { db } from '@/lib/foia/db';
import { cn } from '@/lib/utils';

interface PortalDifficultyRatingProps {
  targetId: string;
  currentScore: number | null;
}

export function PortalDifficultyRating({ targetId, currentScore }: PortalDifficultyRatingProps) {
  const [score, setScore] = useState<number | null>(currentScore);
  const [hovered, setHovered] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const handleRate = async (value: number) => {
    setSaving(true);
    const prev = score;
    setScore(value);
    try {
      await db.from('targets').update({ portal_difficulty_score: value }).eq('id', targetId);
    } catch (err) {
      console.error('Failed to save difficulty:', err);
      setScore(prev);
    } finally {
      setSaving(false);
    }
  };

  const display = hovered ?? score;

  return (
    <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
      <span>Portal difficulty:</span>
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map(i => (
          <button
            key={i}
            onClick={() => handleRate(i)}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            disabled={saving}
            className="transition-colors disabled:opacity-50"
            title={`${i}/5`}
          >
            <Star
              className={cn(
                'h-3.5 w-3.5 transition-colors',
                display !== null && i <= display
                  ? 'fill-amber-400 text-amber-400'
                  : 'text-slate-300'
              )}
            />
          </button>
        ))}
      </div>
      {score && <span className="text-slate-400">{score}/5</span>}
    </div>
  );
}
