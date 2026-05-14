import type { ReactNode } from 'react';

type SettingsScreenProps = {
  visible: boolean;
  children: ReactNode;
};

export function SettingsScreen({ visible, children }: SettingsScreenProps) {
  if (!visible) {
    return null;
  }

  return <>{children}</>;
}
