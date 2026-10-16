import { Button, Menu } from '@mantine/core';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';

/** Language switcher. */
export const LanguageSwitcher = () => {
  const router = useRouter();
  const { i18n, t } = useTranslation('common');

  const changeLanguage = (locale: string) => {
    const { pathname, asPath, query } = router;
    router.push({ pathname, query }, asPath, { locale });
  };

  const languages = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'es', name: 'Español', flag: '🇪🇸' },
    { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  ];

  const currentLanguage = languages.find((lang) => lang.code === i18n.language);

  return (
    <Menu
      shadow="md"
      width={200}
      position="bottom-end"
      aria-label={t('ariaLabels.languageMenu')}
    >
      <Menu.Target>
        <Button
          variant="light"
          size="sm"
          leftSection={currentLanguage?.flag}
          aria-label={t('ariaLabels.languageSwitcher')}
          aria-haspopup="menu"
          aria-expanded={false}
        >
          {i18n.language.toUpperCase()}
        </Button>
      </Menu.Target>
      <Menu.Dropdown aria-label={t('ariaLabels.selectLanguage')}>
        <Menu.Label>{t('ariaLabels.selectLanguage')}</Menu.Label>
        {languages.map((language) => (
          <Menu.Item
            key={language.code}
            onClick={() => changeLanguage(language.code)}
            leftSection={language.flag}
            aria-label={t('ariaLabels.changeLanguageTo', {
              language: language.name,
            })}
          >
            {language.name}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
};
