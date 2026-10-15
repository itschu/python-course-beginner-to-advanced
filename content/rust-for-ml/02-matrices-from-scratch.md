---
title: Vectors and matrices from scratch
summary: A row-major Matrix type with indexing, matrix multiplication, transposition and shape checking, the building block of every model in this phase.
minutes: 55
kind: lesson
language: rust
---

Everything in machine learning is linear algebra on arrays of numbers. NumPy hides how those arrays are stored. In Rust, you'll build the storage yourself, so you see exactly what happens in memory.

## Row-major storage

A matrix with `rows × cols` numbers is stored as **one flat `Vec<f64>`**, row after row. This is called **row-major** order, and it's how NumPy (by default), PyTorch and C arrays store data:

```text
  [[1, 2, 3],          data = [1, 2, 3, 4, 5, 6]
   [4, 5, 6]]          element (r, c) is at index r * cols + c
```

One allocation, contiguous memory: the CPU can stream through it at full speed, which is far faster than a `Vec<Vec<f64>>` with a separate allocation per row.

```rust
use std::ops::{Index, IndexMut};

#[derive(Debug, Clone, PartialEq)]
struct Matrix {
    rows: usize,
    cols: usize,
    data: Vec<f64>,
}

impl Matrix {
    fn zeros(rows: usize, cols: usize) -> Matrix {
        Matrix { rows, cols, data: vec![0.0; rows * cols] }
    }

    fn from_rows(rows: &[&[f64]]) -> Matrix {
        let cols = rows[0].len();
        let mut data = Vec::with_capacity(rows.len() * cols);
        for row in rows {
            assert_eq!(row.len(), cols, "all rows must have the same length");
            data.extend_from_slice(row);
        }
        Matrix { rows: rows.len(), cols, data }
    }

    fn row(&self, r: usize) -> &[f64] {
        &self.data[r * self.cols..(r + 1) * self.cols]
    }
}

// m[(r, c)] reads an element, like m[r, c] in NumPy
impl Index<(usize, usize)> for Matrix {
    type Output = f64;
    fn index(&self, (r, c): (usize, usize)) -> &f64 {
        &self.data[r * self.cols + c]
    }
}

impl IndexMut<(usize, usize)> for Matrix {
    fn index_mut(&mut self, (r, c): (usize, usize)) -> &mut f64 {
        &mut self.data[r * self.cols + c]
    }
}

fn main() {
    let mut m = Matrix::from_rows(&[&[1.0, 2.0, 3.0], &[4.0, 5.0, 6.0]]);
    println!("shape ({}, {}), m[1, 2] = {}", m.rows, m.cols, m[(1, 2)]);
    m[(0, 0)] = 10.0;
    println!("row 0: {:?}", m.row(0));
    println!("flat: {:?}", m.data);
    let z = Matrix::zeros(2, 2);
    println!("{z:?}");
}
```

Implementing the `Index` and `IndexMut` traits gives `Matrix` the `m[(r, c)]` syntax. That's operator overloading again, like `Add` in Phase 10.

## Matrix multiplication

If `A` is `n × k` and `B` is `k × m`, then `C = A B` is `n × m`, with `C[i, j] = Σ A[i, p] · B[p, j]`. This one operation is where neural networks spend almost all their time. A straightforward version:

```rust
fn matmul(a: &[f64], b: &[f64], n: usize, k: usize, m: usize) -> Vec<f64> {
    let mut c = vec![0.0; n * m];
    for i in 0..n {
        for p in 0..k {
            let a_ip = a[i * k + p];
            for j in 0..m {
                c[i * m + j] += a_ip * b[p * m + j];
            }
        }
    }
    c
}

fn main() {
    // [[1, 2], [3, 4]] times [[5, 6], [7, 8]]
    let c = matmul(&[1.0, 2.0, 3.0, 4.0], &[5.0, 6.0, 7.0, 8.0], 2, 2, 2);
    println!("{c:?}");      // [19, 22, 43, 50]
}
```

Notice the loop order: `i`, then `p`, then `j`. The innermost loop walks along a row of `B` and a row of `C`, which are next to each other in memory. The textbook order (`i`, `j`, `p`) jumps down a column of `B` instead, which is several times slower on large matrices because it keeps missing the CPU cache. Libraries like OpenBLAS go much further, with blocking and SIMD instructions; that's why NumPy's `@` is so fast.

## Shapes and errors

NumPy raises `ValueError: shapes (2,3) and (2,3) not aligned` at run time. In Rust you choose: panic (a bug in your code), or return a `Result` (bad input from outside). For a library, `Result` is friendlier:

```rust
#[derive(Debug)]
struct ShapeError {
    left: (usize, usize),
    right: (usize, usize),
}

fn check_matmul(left: (usize, usize), right: (usize, usize)) -> Result<(usize, usize), ShapeError> {
    if left.1 != right.0 {
        return Err(ShapeError { left, right });
    }
    Ok((left.0, right.1))
}

fn main() {
    println!("{:?}", check_matmul((2, 3), (3, 4)));
    if let Err(e) = check_matmul((2, 3), (2, 3)) {
        println!("shapes {:?} and {:?} not aligned", e.left, e.right);
    }
}
```

Libraries such as `nalgebra` go one step further and put dimensions in the **type** with const generics (`Matrix<f64, 2, 3>`), so a shape mismatch doesn't even compile. That's great for robotics and embedded code, where sizes are fixed.

## Practice

:::exercise rml-matmul Matrix multiply and transpose
Complete the `Matrix` methods:

- `transpose(&self) -> Matrix`: rows become columns
- `matmul(&self, other: &Matrix) -> Result<Matrix, String>`: an `Err` (any message) if `self.cols != other.rows`
- `matvec(&self, v: &[f64]) -> Result<Vec<f64>, String>`: multiply by a vector; an `Err` if `v.len() != self.cols`

@@starter
#[derive(Debug, Clone, PartialEq)]
struct Matrix {
    rows: usize,
    cols: usize,
    data: Vec<f64>,
}

impl Matrix {
    fn new(rows: usize, cols: usize, data: Vec<f64>) -> Matrix {
        assert_eq!(data.len(), rows * cols);
        Matrix { rows, cols, data }
    }

    fn get(&self, r: usize, c: usize) -> f64 {
        self.data[r * self.cols + c]
    }

    fn transpose(&self) -> Matrix {
        todo!()
    }

    fn matmul(&self, other: &Matrix) -> Result<Matrix, String> {
        todo!()
    }

    fn matvec(&self, v: &[f64]) -> Result<Vec<f64>, String> {
        todo!()
    }
}

@@solution
#[derive(Debug, Clone, PartialEq)]
struct Matrix {
    rows: usize,
    cols: usize,
    data: Vec<f64>,
}

impl Matrix {
    fn new(rows: usize, cols: usize, data: Vec<f64>) -> Matrix {
        assert_eq!(data.len(), rows * cols);
        Matrix { rows, cols, data }
    }

    fn get(&self, r: usize, c: usize) -> f64 {
        self.data[r * self.cols + c]
    }

    fn transpose(&self) -> Matrix {
        let mut data = Vec::with_capacity(self.data.len());
        for c in 0..self.cols {
            for r in 0..self.rows {
                data.push(self.get(r, c));
            }
        }
        Matrix::new(self.cols, self.rows, data)
    }

    fn matmul(&self, other: &Matrix) -> Result<Matrix, String> {
        if self.cols != other.rows {
            return Err(format!(
                "can't multiply {}x{} by {}x{}",
                self.rows, self.cols, other.rows, other.cols
            ));
        }
        let mut out = vec![0.0; self.rows * other.cols];
        for i in 0..self.rows {
            for p in 0..self.cols {
                let a = self.get(i, p);
                for j in 0..other.cols {
                    out[i * other.cols + j] += a * other.get(p, j);
                }
            }
        }
        Ok(Matrix::new(self.rows, other.cols, out))
    }

    fn matvec(&self, v: &[f64]) -> Result<Vec<f64>, String> {
        if v.len() != self.cols {
            return Err(format!("vector has {} values, matrix has {} columns", v.len(), self.cols));
        }
        Ok((0..self.rows)
            .map(|r| (0..self.cols).map(|c| self.get(r, c) * v[c]).sum())
            .collect())
    }
}

@@tests
/// Transposing a 2x3 matrix gives a 3x2 matrix
#[test]
fn transpose() {
    let m = Matrix::new(2, 3, vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
    assert_eq!(m.transpose(), Matrix::new(3, 2, vec![1.0, 4.0, 2.0, 5.0, 3.0, 6.0]));
}

/// [[1,2],[3,4]] × [[5,6],[7,8]]
#[test]
fn square() {
    let a = Matrix::new(2, 2, vec![1.0, 2.0, 3.0, 4.0]);
    let b = Matrix::new(2, 2, vec![5.0, 6.0, 7.0, 8.0]);
    assert_eq!(a.matmul(&b), Ok(Matrix::new(2, 2, vec![19.0, 22.0, 43.0, 50.0])));
}

/// A 2x3 times a 3x1 gives a 2x1
#[test]
fn rectangular() {
    let a = Matrix::new(2, 3, vec![1.0, 0.0, 2.0, 0.0, 1.0, 1.0]);
    let b = Matrix::new(3, 1, vec![3.0, 4.0, 5.0]);
    assert_eq!(a.matmul(&b), Ok(Matrix::new(2, 1, vec![13.0, 9.0])));
}

/// Mismatched shapes are an error
#[test]
fn mismatch() {
    let a = Matrix::new(2, 3, vec![0.0; 6]);
    assert!(a.matmul(&a).is_err());
    assert!(a.matvec(&[1.0, 2.0]).is_err());
}

/// Matrix times vector
#[test]
fn matvec() {
    let a = Matrix::new(2, 3, vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
    assert_eq!(a.matvec(&[1.0, 0.0, -1.0]), Ok(vec![-2.0, -2.0]));
}

@@hint
For `transpose`, loop over columns first, then rows, pushing `self.get(r, c)`; the result has `self.cols` rows.

@@hint
For `matmul`, check `self.cols != other.rows` first. Then the three nested loops from the lesson, with `out[i * other.cols + j] += self.get(i, p) * other.get(p, j)`.
:::

:::quiz rml-matrix-check Quick check
? In a row-major 3×4 matrix stored as a flat Vec, where is element (2, 1)?
- [ ] index 7
- [x] index 9
- [ ] index 6
> r × cols + c = 2 × 4 + 1 = 9.

? Why store a matrix in one flat Vec instead of a Vec of Vecs?
- [x] One contiguous allocation is much more cache-friendly and faster
- [ ] Vec<Vec<f64>> can't hold floats
- [ ] It uses less precision
> Contiguous memory lets the CPU stream data efficiently.

? What shape is the product of a 5×3 and a 3×2 matrix?
- [ ] 3×3
- [x] 5×2
- [ ] 2×5
> (n × k)(k × m) gives n × m.
:::
