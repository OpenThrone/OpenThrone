const Profile = () => {
  // const router = useRouter();

  return (
    <div className="mainArea pb-10">
      <h2>Profile</h2>
      <div className="rounded-lg bg-gray-900 p-4 shadow-lg grid grid-cols-2 gap-4">
        <div>Current Avatar</div>
        <div>{/* Avatar-image */}</div>
        <div>New Avatar</div>
        <input type="file" accept="image/jpeg, image/jpg, image/gif" />
        <div>Current Friend Avatar</div>
        <div>{/* Friend-Avatar-Image */}</div>
        <div>New Friend Avatar</div>
        <input type="file" accept="image/jpeg, image/jpg, image/gif" />
        <div>Comments</div>
        <textarea className="w-full rounded bg-gray-800 p-2 text-white col-span-2" placeholder="Enter Your Comments" />
      </div>
      <div className="flex justify-end space-x-2 mt-4">
        <button className="bg-green-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">Save Profile</button>
        <button className="bg-green-700 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">View Profile</button>
      </div>
    </div>
  );
};

export default Profile;
