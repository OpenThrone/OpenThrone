import { useUser } from "@/context/users";
import { alertService } from "@/services";
import { Group, Avatar } from "@mantine/core";
import { useState } from "react";
import Alert from "@/components/alert";

const Profile = (props) => {
  const [file, setFile] = useState<File | null>(null);
  const { user, forceUpdate } = useUser();
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newFile = event.target.files?.[0] ?? null;
    setFile(newFile);
  };

  const saveProfile = async () => {
    if (file) {
      const formData = new FormData();
      formData.append('avatar', file);

      try {
        const response = await fetch('/api/account/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          alertService.error('Error uploading file.');
          throw new Error('Network response was not ok');
        }

        const data = await response.json();
        alertService.success('File uploaded successfully.');
        forceUpdate();
        // Handle success here, e.g., show a message or redirect
      } catch (error) {
        console.error('Error uploading file:', error);
        alertService.error('Error uploading file.');
        // Handle errors here, e.g., show an error message
      }
    }
  };

  return (
    <div className="mainArea pb-10">
      <h2 className="page-title">Profile</h2>
      <div className="my-5 flex justify-between">
        <Alert />
      </div>
      <div className="rounded-lg bg-gray-900 p-4 shadow-lg grid grid-cols-2 gap-4">
        <div className="text-xl text-bold">Current Avatar</div>
        <div>
          <Group wrap="nowrap">
          <Avatar
            src={user?.avatar}
            size={150}
            radius="md"
          /></Group></div>
        <div className="text-xl text-bold">New Avatar<br /><div className="text-sm text-gray-400">Limits: 450x450 and 1.5mb</div></div>
        
        <Group wrap="nowrap">
          <Avatar src={''} size={150} radius="md" />
          <input type="file" accept="image/jpeg, image/jpg, image/gif, image/png, image/webp" onChange={handleFileChange} />
        </Group>
        <div className="text-xl text-bold">Comments</div>
        <textarea className="w-full rounded bg-gray-800 p-2 text-white col-span-2" placeholder="Enter Your Comments" />
        <div className="flex justify-end space-x-2 mt-4">
          <button className="bg-green-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded" onClick={saveProfile}>Save Profile</button>
          <button className="bg-green-700 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">View Profile</button>
        </div>
      </div>
      
    </div>
  );
};
export default Profile;