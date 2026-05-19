import type { ReactNode } from 'react';

type SectionContainerProps = {
  isVisible: boolean;
  children: ReactNode;
};

export function SectionContainer({ isVisible, children }: SectionContainerProps) {
  if (!isVisible) {
    return null;
  }
  return <>{children}</>;
}

