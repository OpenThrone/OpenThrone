import MainArea from '@/components/MainArea';
import { Container, Title, Paper, Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

const Result = (props) => {
  const { t } = useTranslation('account');
  return (
    <MainArea title={t('passwordReset.title')}>
      <Container size="xs" className="py-2 md:col-span-9">
        <Paper withBorder shadow="md" p="lg" className="advisor my-3 rounded-lg" style={{ backgroundColor: '#b5a565' }}>
          <div className="flex justify-center">
            <div className="xs:w-96 md:w-3/4">
              <Text>{t('passwordReset.resultText')}</Text>
            </div>
          </div>
        </Paper>
      </Container>
    </MainArea>
  );
}

export default Result;
