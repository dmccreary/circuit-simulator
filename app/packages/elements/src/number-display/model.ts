import type { ModelFactory } from "../api";
import { SensingModel } from "../shared/sensingModel";

export const numberDisplayModel: ModelFactory = (el) => new SensingModel(el);
