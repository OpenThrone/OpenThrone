import Layout from '@/components/Layout';
import { Meta } from '@/layouts/Meta';

const Settings = () => {
  // const router = useRouter();

  return (
    <Layout meta={<Meta title="MetaTitle2" description="Meta Description" />}>
      <div className="mainArea pb-10">
        <h2>Settings</h2>
      </div>
    </Layout>
  );
};

export default Settings;
