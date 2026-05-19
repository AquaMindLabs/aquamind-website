import type { ReactNode } from 'react';

type HomeScreenProps = {
  visible: boolean;
  children: ReactNode;
};

export function HomeScreen({ visible, children }: HomeScreenProps) {
  if (!visible) {
    return null;
  }
  return <>{children}</>;
}

