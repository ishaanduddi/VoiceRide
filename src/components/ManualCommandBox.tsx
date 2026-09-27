import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { colors, fontSize, radius, spacing } from '@/theme';

import { Button } from './Button';

export interface ManualCommandBoxProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Development/testing affordance.
 *
 * Lets the full NLP pipeline be exercised in Expo Go (or anywhere without a
 * configured ASR endpoint). It is NOT part of the hands-free riding flow.
 */
export function ManualCommandBox({
  onSubmit,
  disabled = false,
  placeholder = 'Type a command, e.g. "play song number 7"',
}: ManualCommandBoxProps) {
  const [text, setText] = useState('');

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText('');
  };

  return (
    <View style={styles.container}>
      <TextInput
        value={text}
        onChangeText={setText}
        onSubmitEditing={submit}
        editable={!disabled}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        returnKeyType="send"
        autoCorrect={false}
        autoCapitalize="none"
      />
      <Button title="Send" onPress={submit} disabled={disabled || text.trim().length === 0} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing(1),
    marginTop: spacing(1),
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: spacing(1.5),
    fontSize: fontSize.sm,
  },
});
