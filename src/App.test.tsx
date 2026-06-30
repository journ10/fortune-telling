import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders the initial product title', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: '三钱成卦' })).toBeInTheDocument();
    expect(screen.getByText('输入所问之事，以六次掷钱完成一卦。')).toBeInTheDocument();
  });
});
