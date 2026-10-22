import type { ModelFactory } from "../api";
import { SensingModel } from "../shared/sensingModel";

export const sevenSegmentModel: ModelFactory = (el) => new SensingModel(el);
