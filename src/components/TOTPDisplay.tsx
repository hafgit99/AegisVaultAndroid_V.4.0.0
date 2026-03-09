import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Clipboard, Alert } from 'react-native';
import { generateTOTP, isValidTOTPSecret } from '../TOTPModule';

const C = {
  navy: '#101828', sage: '#72886f', sageLight: 'rgba(114,136,111,0.12)',
  card: 'rgba(255,255,255,0.45)', cardBorder: 'rgba(255,255,255,0.55)',
  green: '#22c55e', greenBg: 'rgba(34,197,94,0.08)', muted: 'rgba(16,24,40,0.45)',
  cyan: '#06b6d4', red: '#ef4444', white: '#fff', amber: '#f59e0b',
};

interface Props {
  secret: string;
  period?: number;
  digits?: number;
  algorithm?: string;
  issuer?: string;
  compact?: boolean;
}

export const TOTPDisplay = ({ secret, period = 30, digits = 6, algorithm = 'sha1', issuer, compact = false }: Props) => {
  const [code, setCode] = useState('------');
  const [remaining, setRemaining] = useState(period);
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const valid = isValidTOTPSecret(secret);

  useEffect(() => {
    if (!valid) return;

    const updateCode = () => {
      const result = generateTOTP({ secret, period, digits, algorithm });
      setCode(result.code);
      setRemaining(result.remaining);
      setProgress(result.progress);

      // Pulse animation when code changes (new period)
      if (result.remaining >= period - 1) {
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: 150, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
        ]).start();
      }
    };

    updateCode();
    const interval = setInterval(updateCode, 1000);
    return () => clearInterval(interval);
  }, [secret, period, digits, algorithm]);

  const copyCode = () => {
    if (!valid) return;
    Clipboard.setString(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!valid) {
    return (
      <View style={[st.container, compact && st.containerCompact]}>
        <Text style={st.invalidText}>⚠️ Geçersiz TOTP anahtarı</Text>
      </View>
    );
  }

  // Format code with space in middle: "123 456"
  const formattedCode = code.length === 6
    ? `${code.slice(0, 3)} ${code.slice(3)}`
    : code.length === 8
      ? `${code.slice(0, 4)} ${code.slice(4)}`
      : code;

  // Color based on remaining time
  const timerColor = remaining <= 5 ? C.red : remaining <= 10 ? C.amber : C.sage;
  const arcProgress = 1 - progress;

  if (compact) {
    return (
      <TouchableOpacity style={st.compactContainer} onPress={copyCode} activeOpacity={0.7}>
        <View style={st.compactLeft}>
          <View style={[st.compactTimer, { borderColor: timerColor }]}>
            <Text style={[st.compactTimerText, { color: timerColor }]}>{remaining}</Text>
          </View>
          <Animated.Text style={[st.compactCode, { transform: [{ scale: pulseAnim }] }]}>
            {formattedCode}
          </Animated.Text>
        </View>
        <Text style={{ fontSize: 13, color: copied ? C.green : C.muted }}>
          {copied ? '✓' : '📋'}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={st.container} onPress={copyCode} activeOpacity={0.7}>
      {/* Header */}
      <View style={st.header}>
        <View style={st.headerLeft}>
          <Text style={st.totpIcon}>🔑</Text>
          <Text style={st.headerLabel}>TOTP Doğrulama Kodu</Text>
        </View>
        <Text style={{ fontSize: 13, color: copied ? C.green : C.muted, fontWeight: '600' }}>
          {copied ? '✓ Kopyalandı' : 'Kopyala'}
        </Text>
      </View>

      {/* Code Display */}
      <View style={st.codeRow}>
        <Animated.Text style={[st.codeText, { transform: [{ scale: pulseAnim }] }]}>
          {formattedCode}
        </Animated.Text>
      </View>

      {/* Timer */}
      <View style={st.timerRow}>
        {/* Progress bar */}
        <View style={st.progressBar}>
          <View style={[st.progressFill, {
            width: `${arcProgress * 100}%`,
            backgroundColor: timerColor,
          }]} />
        </View>

        {/* Countdown */}
        <View style={[st.timerBadge, { borderColor: timerColor }]}>
          <Text style={[st.timerText, { color: timerColor }]}>{remaining}s</Text>
        </View>
      </View>

      {issuer && (
        <Text style={st.issuerText}>{issuer}</Text>
      )}
    </TouchableOpacity>
  );
};

const st = StyleSheet.create({
  container: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  containerCompact: {
    padding: 12,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  totpIcon: {
    fontSize: 16,
  },
  headerLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  codeRow: {
    alignItems: 'center',
    marginBottom: 16,
  },
  codeText: {
    fontSize: 36,
    fontWeight: '800',
    color: C.navy,
    letterSpacing: 8,
    fontVariant: ['tabular-nums'],
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(16,24,40,0.06)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    transition: 'width 1s linear',
  },
  timerBadge: {
    borderWidth: 2,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 44,
    alignItems: 'center',
  },
  timerText: {
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  issuerText: {
    fontSize: 11,
    color: C.muted,
    fontWeight: '600',
    marginTop: 10,
    textAlign: 'center',
  },
  invalidText: {
    fontSize: 12,
    color: C.amber,
    fontWeight: '600',
    textAlign: 'center',
  },

  // Compact styles
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(114,136,111,0.06)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(114,136,111,0.15)',
  },
  compactLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  compactTimer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactTimerText: {
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  compactCode: {
    fontSize: 22,
    fontWeight: '800',
    color: C.navy,
    letterSpacing: 4,
    fontVariant: ['tabular-nums'],
  },
});
