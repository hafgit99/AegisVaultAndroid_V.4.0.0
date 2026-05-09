import React from 'react';

import {
  CardForm,
  CryptoWalletForm,
  DocumentForm,
  IdentityForm,
  LoginForm,
  NoteForm,
  WifiForm,
} from './categoryForms/BasicCategoryForms';
import { PasskeyForm } from './categoryForms/PasskeyForm';

export const CategoryForm = ({
  category,
  form,
  setForm,
  showPw,
  setShowPw,
  pwLen,
  t,
  theme,
}: any) => {
  switch (category) {
    case 'card':
      return (
        <CardForm
          form={form}
          setForm={setForm}
          showPw={showPw}
          setShowPw={setShowPw}
          t={t}
          theme={theme}
        />
      );
    case 'identity':
      return <IdentityForm form={form} setForm={setForm} t={t} theme={theme} />;
    case 'note':
      return <NoteForm form={form} setForm={setForm} t={t} theme={theme} />;
    case 'wifi':
      return (
        <WifiForm
          form={form}
          setForm={setForm}
          showPw={showPw}
          setShowPw={setShowPw}
          t={t}
          theme={theme}
        />
      );
    case 'crypto_wallet':
      return (
        <CryptoWalletForm
          form={form}
          setForm={setForm}
          showPw={showPw}
          t={t}
          theme={theme}
        />
      );
    case 'document':
      return <DocumentForm form={form} setForm={setForm} t={t} theme={theme} />;
    case 'passkey':
      return <PasskeyForm form={form} setForm={setForm} t={t} theme={theme} />;
    default:
      return (
        <LoginForm
          form={form}
          setForm={setForm}
          showPw={showPw}
          setShowPw={setShowPw}
          pwLen={pwLen}
          t={t}
          theme={theme}
        />
      );
  }
};
