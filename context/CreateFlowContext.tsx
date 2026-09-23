import { createContext, useContext } from "react";

type CreateFlowValue = {
  openCreateSheet: () => void;
  openBizActions: () => void;
};

export const CreateFlowContext = createContext<CreateFlowValue>({
  openCreateSheet: () => {},
  openBizActions: () => {},
});

export const useCreateFlow = () => useContext(CreateFlowContext);
