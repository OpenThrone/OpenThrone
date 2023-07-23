import Layout from '@/components/Layout';
import { Meta } from '@/layouts/Meta';

const Profile = () => {
  // const router = useRouter();

  return (
    <Layout meta={<Meta title="MetaTitle2" description="Meta Description" />}>
      <div className="mainArea pb-10">
        <h2>Profile</h2>
        <div className="rounded-lg bg-gray-900 p-4  shadow-lg">
          <div className="mb-2 text-sm font-bold">Change Bio</div>
          <div className="p-2">
            <form id="changeBio">
              <div className="mb-2">
                <textarea
                  className="w-full rounded bg-gray-800 p-2 text-white"
                  id="currentBio"
                  name="currentBio"
                  placeholder="Enter Your Bio"
                />
              </div>
              <div className="flex justify-end">
                <button
                  className="inline-block  rounded bg-green-900 px-6 pb-2 pt-2.5 text-xs uppercase leading-normal"
                  id="submitPassword"
                  name="submitPassword"
                  type="submit"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Profile;
