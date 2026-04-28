import React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ExportFormat, ImportResult, ImportSource } from '../../BackupModule';

type ThemeColors = Record<string, string>;
type ImportSourceOption = {
  id: ImportSource;
  label: string;
  icon: string;
  extensions: string[];
};

interface BackupResultPanelProps {
  cc: ThemeColors;
  result: ImportResult;
  t: any;
  onClose: () => void;
}

export const BackupResultPanel = ({
  cc,
  result,
  t,
  onClose,
}: BackupResultPanelProps) => (
  <View
    style={[
      styles.resultBox,
      { backgroundColor: cc.card },
      result.imported > 0
        ? { borderColor: cc.green }
        : { borderColor: cc.amber },
    ]}
  >
    <Text style={[styles.resultTitle, { color: cc.navy }]}>
      {result.imported > 0 ? t('backup.res_success') : t('backup.res_warn')}
    </Text>
    <View style={styles.resultRow}>
      <ResultStat
        color={cc.sage}
        label={t('backup.res_total')}
        muted={cc.muted}
        value={result.total}
      />
      <ResultStat
        color={cc.green}
        label={t('backup.res_imported')}
        muted={cc.muted}
        value={result.imported}
      />
      <ResultStat
        color={cc.red}
        label={t('backup.res_skipped')}
        muted={cc.muted}
        value={result.skipped}
      />
    </View>
    {result.errors.length > 0 && (
      <View style={styles.resultErrors}>
        <Text style={[styles.resultErrorsTitle, { color: cc.muted }]}>
          {t('backup.res_errors')}
        </Text>
        {result.errors.slice(0, 5).map((error, index) => (
          <Text
            key={`${error}-${index}`}
            style={[styles.resultErrorText, { color: cc.red }]}
          >
            - {error}
          </Text>
        ))}
        {result.errors.length > 5 && (
          <Text style={[styles.resultMoreText, { color: cc.muted }]}>
            {t('backup.err_more', {
              count: result.errors.length - 5,
            })}
          </Text>
        )}
      </View>
    )}
    <TouchableOpacity style={styles.resultCloseBtn} onPress={onClose}>
      <Text style={[styles.resultCloseText, { color: cc.sage }]}>
        {t('backup.btn_ok')}
      </Text>
    </TouchableOpacity>
  </View>
);

interface ResultStatProps {
  color: string;
  label: string;
  muted: string;
  value: number;
}

const ResultStat = ({ color, label, muted, value }: ResultStatProps) => (
  <View style={styles.resultStat}>
    <Text style={[styles.resultNum, { color }]}>{value}</Text>
    <Text style={[styles.resultLabel, { color: muted }]}>{label}</Text>
  </View>
);

interface ExportFormatCardProps {
  cc: ThemeColors;
  format: ExportFormat;
  isEncrypted: boolean;
  t: any;
  onPress: () => void;
}

export const ExportFormatCard = ({
  cc,
  format,
  isEncrypted,
  t,
  onPress,
}: ExportFormatCardProps) => (
  <TouchableOpacity
    style={[
      styles.formatCard,
      { backgroundColor: cc.card, borderColor: cc.cardBorder },
      isEncrypted && [
        styles.encryptedCard,
        {
          borderColor: cc.sageMid,
          backgroundColor: cc.sageLight,
        },
      ],
    ]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <View style={[styles.formatIconBox, { backgroundColor: cc.sageLight }]}>
      <Text style={styles.formatIcon}>{format.icon}</Text>
    </View>
    <View style={styles.flexOne}>
      <Text style={[styles.formatTitle, { color: cc.navy }]}>
        {format.label}
      </Text>
      <Text style={[styles.formatDesc, { color: cc.muted }]}>
        {format.description}
      </Text>
      {isEncrypted && (
        <Text style={[styles.recommendedBadge, { color: cc.sage }]}>
          {t('backup.encrypted_recommended')}
        </Text>
      )}
    </View>
    <Text style={[styles.chevron, { color: cc.muted }]}>{'>'}</Text>
  </TouchableOpacity>
);

interface ImportSourceCardProps {
  cc: ThemeColors;
  source: ImportSourceOption;
  subtitle: string;
  onPress: () => void;
}

export const ImportSourceCard = ({
  cc,
  source,
  subtitle,
  onPress,
}: ImportSourceCardProps) => (
  <TouchableOpacity
    style={[
      styles.sourceCard,
      {
        backgroundColor: cc.card,
        borderColor: cc.cardBorder,
      },
    ]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <Text style={styles.sourceIcon}>{source.icon}</Text>
    <View style={styles.flexOne}>
      <Text style={[styles.sourceTitle, { color: cc.navy }]}>
        {source.label}
      </Text>
      <Text style={[styles.sourceExt, { color: cc.muted }]}>{subtitle}</Text>
    </View>
    <Text style={[styles.chevron, { color: cc.muted }]}>{'>'}</Text>
  </TouchableOpacity>
);

interface BackupPasswordModalProps {
  cc: ThemeColors;
  visible: boolean;
  title: string;
  description: string;
  passwordPlaceholder: string;
  password: string;
  showPassword: boolean;
  confirmPlaceholder?: string;
  confirmPassword?: string;
  showConfirmPassword?: boolean;
  validationMessages?: string[];
  primaryLabel: string;
  cancelLabel: string;
  showPasswordLabel: string;
  hidePasswordLabel: string;
  primaryDisabled?: boolean;
  onPasswordChange: (value: string) => void;
  onTogglePassword: () => void;
  onConfirmPasswordChange?: (value: string) => void;
  onToggleConfirmPassword?: () => void;
  onCancel: () => void;
  onPrimary: () => void;
}

export const BackupPasswordModal = ({
  cc,
  visible,
  title,
  description,
  passwordPlaceholder,
  password,
  showPassword,
  confirmPlaceholder,
  confirmPassword = '',
  showConfirmPassword = false,
  validationMessages = [],
  primaryLabel,
  cancelLabel,
  showPasswordLabel,
  hidePasswordLabel,
  primaryDisabled,
  onPasswordChange,
  onTogglePassword,
  onConfirmPasswordChange,
  onToggleConfirmPassword,
  onCancel,
  onPrimary,
}: BackupPasswordModalProps) => (
  <Modal visible={visible} animationType="fade" transparent>
    <View style={styles.pwOverlay}>
      <View style={[styles.pwContainer, { backgroundColor: cc.bg }]}>
        <Text style={[styles.pwTitle, { color: cc.navy }]}>{title}</Text>
        <Text style={[styles.pwDesc, { color: cc.muted }]}>
          {description}
        </Text>

        <PasswordInputRow
          cc={cc}
          placeholder={passwordPlaceholder}
          value={password}
          visible={showPassword}
          showLabel={showPasswordLabel}
          hideLabel={hidePasswordLabel}
          onChange={onPasswordChange}
          onToggle={onTogglePassword}
        />

        {confirmPlaceholder &&
          onConfirmPasswordChange &&
          onToggleConfirmPassword && (
            <PasswordInputRow
              cc={cc}
              placeholder={confirmPlaceholder}
              value={confirmPassword}
              visible={showConfirmPassword}
              showLabel={showPasswordLabel}
              hideLabel={hidePasswordLabel}
              onChange={onConfirmPasswordChange}
              onToggle={onToggleConfirmPassword}
            />
          )}

        {validationMessages.map(message => (
          <Text
            key={message}
            style={[styles.validationError, { color: cc.red }]}
          >
            {message}
          </Text>
        ))}

        <View style={styles.modalButtonRow}>
          <TouchableOpacity
            style={[styles.pwBtn, { backgroundColor: cc.sageLight }]}
            onPress={onCancel}
          >
            <Text style={[styles.modalSecondaryText, { color: cc.navy }]}>
              {cancelLabel}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.pwBtn, styles.primaryPwBtn, { backgroundColor: cc.sage }]}
            onPress={onPrimary}
            disabled={primaryDisabled}
            activeOpacity={0.7}
          >
            <Text style={styles.modalPrimaryText}>{primaryLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

interface PasswordInputRowProps {
  cc: ThemeColors;
  placeholder: string;
  value: string;
  visible: boolean;
  showLabel: string;
  hideLabel: string;
  onChange: (value: string) => void;
  onToggle: () => void;
}

const PasswordInputRow = ({
  cc,
  placeholder,
  value,
  visible,
  showLabel,
  hideLabel,
  onChange,
  onToggle,
}: PasswordInputRowProps) => (
  <View style={styles.pwInputRow}>
    <TextInput
      style={[
        styles.pwInput,
        {
          backgroundColor: cc.inputBg,
          borderColor: cc.cardBorder,
          color: cc.navy,
        },
      ]}
      placeholder={placeholder}
      placeholderTextColor={cc.muted}
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      value={value}
      onChangeText={onChange}
    />
    <TouchableOpacity onPress={onToggle} style={styles.pwEye}>
      <Text style={[styles.pwToggleText, { color: cc.sage }]}>
        {visible ? hideLabel : showLabel}
      </Text>
    </TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  chevron: {
    fontSize: 18,
  },
  encryptedCard: {
    backgroundColor: 'rgba(114,136,111,0.06)',
  },
  flexOne: {
    flex: 1,
  },
  formatCard: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 10,
    padding: 16,
  },
  formatDesc: {
    fontSize: 12,
    marginTop: 3,
  },
  formatIcon: {
    fontSize: 24,
  },
  formatIconBox: {
    alignItems: 'center',
    borderRadius: 14,
    height: 48,
    justifyContent: 'center',
    marginRight: 14,
    width: 48,
  },
  formatTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  recommendedBadge: {
    fontSize: 11,
    fontWeight: '800',
    marginTop: 8,
    textTransform: 'uppercase',
  },
  resultBox: {
    borderRadius: 20,
    borderWidth: 2,
    marginBottom: 16,
    padding: 20,
  },
  resultCloseBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(114,136,111,0.12)',
    borderRadius: 14,
    marginTop: 16,
    paddingVertical: 12,
  },
  resultCloseText: {
    fontSize: 13,
    fontWeight: '700',
  },
  resultErrorText: {
    fontSize: 11,
    marginBottom: 2,
  },
  resultErrors: {
    marginTop: 12,
  },
  resultErrorsTitle: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  resultLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  resultMoreText: {
    fontSize: 11,
  },
  resultNum: {
    fontSize: 28,
    fontWeight: '800',
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  resultStat: {
    alignItems: 'center',
  },
  resultTitle: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 16,
    textAlign: 'center',
  },
  sourceCard: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 8,
    padding: 14,
  },
  sourceExt: {
    fontSize: 11,
    marginTop: 2,
  },
  sourceIcon: {
    fontSize: 22,
    marginRight: 14,
    textAlign: 'center',
    width: 32,
  },
  sourceTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  modalButtonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  modalPrimaryText: {
    color: '#fff',
    fontWeight: '700',
  },
  modalSecondaryText: {
    fontWeight: '700',
  },
  primaryPwBtn: {
    flex: 2,
  },
  pwBtn: {
    alignItems: 'center',
    borderRadius: 14,
    flex: 1,
    paddingVertical: 14,
  },
  pwContainer: {
    borderRadius: 24,
    padding: 24,
  },
  pwDesc: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 20,
  },
  pwEye: {
    marginBottom: 10,
    marginLeft: 4,
    padding: 10,
  },
  pwInput: {
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  pwInputRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  pwOverlay: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  pwTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  pwToggleText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  validationError: {
    fontSize: 11,
    marginTop: 4,
  },
});
