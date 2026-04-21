import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Signal, SIGNAL_LABELS, SIGNAL_COLORS, SIGNAL_EMOJI } from '../core/fiveLines';

interface Props {
  signal: Signal;
  small?: boolean;
  showEmoji?: boolean;
}

export function SignalBadge({ signal, small, showEmoji = true }: Props) {
  const color = SIGNAL_COLORS[signal];
  const label = SIGNAL_LABELS[signal];
  const emoji = SIGNAL_EMOJI[signal];
  return (
    <View style={[styles.badge, { backgroundColor: color }, small && styles.small]}>
      <Text style={[styles.text, small && styles.smallText]}>
        {showEmoji ? `${emoji} ` : ''}{label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  small: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  text: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  smallText: {
    fontSize: 11,
  },
});
