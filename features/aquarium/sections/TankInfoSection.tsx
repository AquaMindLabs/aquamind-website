import type { ReactNode } from 'react';

import { SectionContainer } from '@/features/aquarium/sections/SectionContainer';

type TankInfoSectionProps = {
  isVisible: boolean;
  children: ReactNode;
};

export function TankInfoSection({ isVisible, children }: TankInfoSectionProps) {
  return <SectionContainer isVisible={isVisible}>{children}</SectionContainer>;
}

