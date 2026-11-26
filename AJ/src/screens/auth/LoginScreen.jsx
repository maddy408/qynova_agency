import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { friendlyErrorMessage } from '../../api/client';
import { colors } from '../../theme/colors';
import { Icon } from '../../components/Icon';

export function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState({ email: false, password: false });
  const [fieldErrors, setFieldErrors] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const validateEmail = (val) => {
    const trimmed = String(val ?? '').trim();
    if (!trimmed) return 'Email is required.';
    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmed)) {
      return 'Please enter a valid email address (e.g. name@domain.com).';
    }
    return '';
  };

  const validatePassword = (val) => {
    if (!val) return 'Password is required.';
    return '';
  };

  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    if (field === 'email') {
      setFieldErrors((prev) => ({ ...prev, email: validateEmail(email) }));
    } else if (field === 'password') {
      setFieldErrors((prev) => ({ ...prev, password: validatePassword(password) }));
    }
  };

  const handleEmailChange = (val) => {
    setEmail(val);
    setError('');
    if (touched.email) {
      setFieldErrors((prev) => ({ ...prev, email: validateEmail(val) }));
    }
  };

  const handlePasswordChange = (val) => {
    setPassword(val);
    setError('');
    if (touched.password) {
      setFieldErrors((prev) => ({ ...prev, password: validatePassword(val) }));
    }
  };

  const submit = async () => {
    setError('');
    const emailErr = validateEmail(email);
    const passErr = validatePassword(password);
    setTouched({ email: true, password: true });
    setFieldErrors({ email: emailErr, password: passErr });

    if (emailErr || passErr) {
      return;
    }

    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const hasErrors = (touched.email && !!fieldErrors.email) || (touched.password && !!fieldErrors.password);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.card}>
          <Text style={styles.brand}>AJ Agency</Text>
          <Text style={styles.subtitle}>DISTRIBUTOR BILLING &amp; INVENTORY</Text>

          <Text style={styles.label}>
            Email <Text style={{ color: colors.danger }}>*</Text>
          </Text>
          <TextInput
            value={email}
            onChangeText={handleEmailChange}
            onBlur={() => handleBlur('email')}
            autoCapitalize="none"
            keyboardType="email-address"
            returnKeyType="next"
            style={[
              styles.input,
              touched.email && fieldErrors.email ? styles.inputError : null,
            ]}
          />
          {touched.email && fieldErrors.email ? (
            <Text style={styles.fieldError}>{fieldErrors.email}</Text>
          ) : null}

          <Text style={styles.label}>
            Password <Text style={{ color: colors.danger }}>*</Text>
          </Text>
          <View
            style={[
              styles.passwordRow,
              touched.password && fieldErrors.password ? styles.inputError : null,
            ]}
          >
            <TextInput
              value={password}
              onChangeText={handlePasswordChange}
              onBlur={() => handleBlur('password')}
              secureTextEntry={!showPassword}
              returnKeyType="done"
              onSubmitEditing={submit}
              style={styles.passwordInput}
            />
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Icon name={showPassword ? 'eyeOff' : 'eye'} size={20} color={colors.inkMuted} />
            </TouchableOpacity>
          </View>
          {touched.password && fieldErrors.password ? (
            <Text style={styles.fieldError}>{fieldErrors.password}</Text>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, (loading || hasErrors) && styles.buttonDisabled]}
            onPress={submit}
            disabled={loading || hasErrors}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  scrollContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 360, backgroundColor: colors.card, borderRadius: 16, padding: 24, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 },
  brand: { fontSize: 26, fontWeight: '700', color: colors.gold, textAlign: 'center' },
  subtitle: { fontSize: 10, letterSpacing: 1.5, color: colors.inkMuted, textAlign: 'center', marginBottom: 24 },
  label: { fontSize: 12, fontWeight: '600', color: colors.inkMuted, marginBottom: 4, marginTop: 12 },
  input: { borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.ink },
  inputError: { borderColor: colors.danger, borderWidth: 1.5 },
  fieldError: { color: colors.danger, fontSize: 11, marginTop: 3, fontWeight: '600' },
  passwordRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 10, paddingRight: 8 },
  passwordInput: { flex: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.ink },
  eyeButton: { padding: 6 },
  error: { color: colors.danger, fontSize: 13, marginTop: 12, textAlign: 'center' },
  button: { backgroundColor: colors.success, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
