import Layout from '@/components/Layout';
import { Meta } from '@/layouts/Meta';

const Training = () => {
  // const router = useRouter();

  return (
    <Layout meta={<Meta title="MetaTitle2" description="Meta Description" />}>
      <div className="mainArea pb-10">
        <h2>Training</h2>
      </div>
    </Layout>
  );
};

export default Training;
