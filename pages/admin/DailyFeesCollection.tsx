import React from "react";
import Layout from "../../components/Layout";
import DailyCollections from "../../components/finance/DailyCollections";
import DailyCollectionHandover from "../../components/finance/DailyCollectionHandover";

const DailyFeesCollection: React.FC = () => {
  return (
    <Layout title="Daily Fees Collection">
      <DailyCollections />
      <DailyCollectionHandover />
    </Layout>
  );
};

export default DailyFeesCollection;