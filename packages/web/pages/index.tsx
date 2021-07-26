import { useEffect, useState } from 'react';
import { createStyles, makeStyles, Theme } from '@material-ui/core/styles';
import { AppBar, CircularProgress, CssBaseline, Container, IconButton, Toolbar, Typography } from '@material-ui/core';
import MenuIcon from '@material-ui/icons/Menu';

import axios from 'axios';

const baseURL = 'http://127.0.0.1:4000/';

const api = axios.create({ baseURL });

const useStyles = makeStyles((theme: Theme) =>
    createStyles({
        root: {
            flexGrow: 1,
        },
        menuButton: {
            marginRight: theme.spacing(2),
        },
        title: {
            flexGrow: 1,
        },
        content: {

        },
    })
);

interface Statistics {
    usersCount: number,
    stickers: {
        static: number,
        animated: number,
        image: number,
    },
    commands: Record<string, number>,
}

export default function Home() {
    const classes = useStyles();
    const [stats, setStats] = useState<Statistics | null>(null);

    useEffect(() => {
        api.get('/statistics').then((response) => {
            setStats(response.data);
        }).catch(console.error);
    }, []);

    return <div className={classes.root}>
        <AppBar position='static'>
            <Toolbar>
                <IconButton edge='start' className={classes.menuButton} color='inherit' aria-label='menu'>
                    <MenuIcon />
                </IconButton>
                <Typography variant='h6' className={classes.title}>
                    Statistics
                </Typography>
            </Toolbar>
        </AppBar>
        <CssBaseline />
        <Container>
            {!stats && <CircularProgress />}
            {stats && <pre>{JSON.stringify(stats)}</pre>}
        </Container>
    </div>;
}
