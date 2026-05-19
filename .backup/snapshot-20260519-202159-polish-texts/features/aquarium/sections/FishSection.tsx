import type { ReactNode } from 'react';

import { SectionContainer } from '@/features/aquarium/sections/SectionContainer';

type FishSectionProps = {
  isVisible: boolean;
  children: ReactNode;
};

export function FishSection({ isVisible, children }: FishSectionProps) {
  return <SectionContainer isVisible={isVisible}>{children}</SectionContainer>;
}

