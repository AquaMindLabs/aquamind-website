import {
  Text as NativeText,
  TextInput as NativeTextInput,
  type TextInputProps,
  type TextProps,
} from 'react-native';

import {
  translateInlineNode,
  translateInlineText,
} from '@/constants/inlineTranslations';
import { useTank } from '@/features/aquarium/context/TankContext';

function useAppLanguage(): string {
  const { appSettings } = useTank();
  return String(appSettings?.language ?? 'pl');
}

export function Text({ children, ...props }: TextProps) {
  const language = useAppLanguage();
  return <NativeText {...props}>{translateInlineNode(children, language)}</NativeText>;
}

export function TextInput({ placeholder, ...props }: TextInputProps) {
  const language = useAppLanguage();
  return (
    <NativeTextInput
      {...props}
      placeholder={
        typeof placeholder === 'string'
          ? translateInlineText(placeholder, language)
          : placeholder
      }
    />
  );
}
