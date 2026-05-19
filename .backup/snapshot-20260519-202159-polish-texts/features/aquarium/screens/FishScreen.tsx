import type { ReactNode } from 'react';

type FishScreenProps = {
  visible: boolean;
  children: ReactNode;
};

export function FishScreen({ visible, children }: FishScreenProps) {
  if (!visible) {
    return null;
  }

  return <>{children}</>;
}
