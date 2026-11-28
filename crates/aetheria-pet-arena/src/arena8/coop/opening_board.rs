use super::{CELLS, SIDE, Tile, TileIdentity, spawn_identity};
use aetheria_game_core::{Error, TurnRng};

/// Create a full board with no existing matches and at least one legal swap.
/// The opening motif has two equal tiles beside a distinct one, with a third
/// matching tile beside the distinct one. Its location and orientation are randomized.
pub(super) fn construct(
    identities: [TileIdentity; 6],
    spawn_table: [u32; 6],
    spawn_total: u32,
    rng: &mut TurnRng,
) -> Result<[Option<Tile>; CELLS], Error> {
    let a = spawn_identity(identities, spawn_table, rng.below(spawn_total)?);
    let mut alternatives = spawn_table;
    alternatives[a.index()] = 0;
    let b = spawn_identity(
        identities,
        alternatives,
        rng.below(spawn_total - spawn_table[a.index()])?,
    );
    let row = rng.below((SIDE - 1) as u32)? as usize;
    let col = rng.below((SIDE - 2) as u32)? as usize;
    let transpose = rng.below(2)? == 1;
    let index = |row, col| {
        if transpose {
            col * SIDE + row
        } else {
            row * SIDE + col
        }
    };

    // A A B
    // . . A
    //
    // Swapping B with A below it creates a row of three A tiles.
    let mut board = [None; CELLS];
    for (dy, dx, identity) in [(0, 0, a), (0, 1, a), (0, 2, b), (1, 2, a)] {
        board[index(row + dy, col + dx)] = Some(Tile {
            identity,
            multiplier: 1,
        });
    }

    for index in 0..CELLS {
        if board[index].is_some() {
            continue;
        }
        let mut allowed = spawn_table;
        exclude_triples(&board, index, 1, index % SIDE, &mut allowed);
        exclude_triples(&board, index, SIDE, index / SIDE, &mut allowed);
        // Each axis can exclude at most two distinct elements. All six
        // authored weights are positive, so this sum is always nonzero.
        let roll = rng.below(allowed.iter().sum())?;
        board[index] = Some(Tile {
            identity: spawn_identity(identities, allowed, roll),
            multiplier: 1,
        });
    }
    Ok(board)
}

fn exclude_triples(
    board: &[Option<Tile>; CELLS],
    index: usize,
    stride: usize,
    position: usize,
    allowed: &mut [u32; 6],
) {
    let mut exclude_equal_pair = |left: usize, right: usize| {
        if let (Some(left), Some(right)) = (board[left], board[right])
            && left.identity == right.identity
        {
            allowed[left.identity.index()] = 0;
        }
    };
    if position >= 2 {
        exclude_equal_pair(index - 2 * stride, index - stride);
    }
    if position >= 1 && position + 1 < SIDE {
        exclude_equal_pair(index - stride, index + stride);
    }
    if position + 2 < SIDE {
        exclude_equal_pair(index + stride, index + 2 * stride);
    }
}
