import { DenseLU, SPARSE_MIN_SIZE, type LinearSolver } from "./solver";
import { SparseLU } from "./sparse-lu";

/** Dense LU for small systems, sparse LU with Markowitz ordering from SPARSE_MIN_SIZE unknowns up. */
export function createSolver(size: number): LinearSolver {
  return size < SPARSE_MIN_SIZE ? new DenseLU() : new SparseLU();
}
