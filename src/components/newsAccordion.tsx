import { table } from 'console';
import { useState } from 'react';

const NewsAccordion = ({ news }) => {
  const [isOpen, setIsOpen] = useState(Array(news.length).fill(false));
  
  console.log('news: ', news);
  const toggleAccordion = (index) => {
    const newState = [...isOpen];
    newState[index] = !newState[index];
    setIsOpen(newState);
  };

  return (
    <table className="min-w-full divide-y divide-gray-200 my-4 table-auto text-white ">
      <thead>
        <tr className='odd:bg-table-odd even:bg-table-even'>
          <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
            Title
          </th>
          <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
            Date
          </th>
          <th scope="col" className="relative px-6 py-3">
            <span className="sr-only">Expand</span>
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200">
        {news.map((item, index) => (
          <>
            <tr key={item.id} className="odd:bg-table-odd even:bg-table-even">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                {item.title}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm ">
                {new Date(item.created_timestamp).toLocaleDateString() + ' ' + new Date(item.created_timestamp).toLocaleTimeString()}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <button onClick={() => toggleAccordion(index)}>
                  {isOpen[index] ? 'Collapse' : 'Expand'}
                </button>
              </td>
            </tr>
            {isOpen[index] && (
              <tr className="odd:bg-table-odd even:bg-table-even">
                <td colSpan={parseInt("3")} className="px-6 py-4">
                  <p className="text-sm text-gray-500">{item.content.substring(0, 200)}...</p>
                  <a href={`/community/news/${item.id}`} className="text-blue-500 hover:underline">Read more</a>
                </td>
              </tr>
            )}
          </>
        ))}
      </tbody>
    </table>
  );
};

export default NewsAccordion;