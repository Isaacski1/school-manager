import React from "react";
import Layout from "../../components/Layout";
import DailyCollections from "../../components/finance/DailyCollections";

const DailyFeesCollection: React.FC = () => {
  return (
    <Layout title="Daily Fees Collection">
      <DailyCollections />
    </Layout>
  );
};

export default DailyFeesCollection;