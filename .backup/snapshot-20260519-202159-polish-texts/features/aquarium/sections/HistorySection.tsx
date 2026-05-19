import type { ReactNode } from 'react';

import { SectionContainer } from '@/features/aquarium/sections/SectionContainer';

type HistorySectionProps = {
  isVisible: boolean;
  children: ReactNode;
};

export function HistorySection({ isVisible, children }: HistorySectionProps) {
  return <SectionContainer isVisible={isVisible}>{children}</SectionContainer>;
}

