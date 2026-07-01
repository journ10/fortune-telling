import { render, screen } from '@testing-library/react';
import CastProgressToast from './CastProgressToast';

describe('CastProgressToast', () => {
  it('renders the current throw progress when not animating', () => {
    render(<CastProgressToast currentThrow={3} isAnimating={false} />);

    expect(screen.getByRole('status')).toHaveTextContent('第 3 掷 / 共 6 掷');
  });

  it('renders the settling status while animating', () => {
    render(<CastProgressToast currentThrow={4} isAnimating={true} />);

    expect(screen.getByRole('status')).toHaveTextContent('铜钱落定中');
  });
});
